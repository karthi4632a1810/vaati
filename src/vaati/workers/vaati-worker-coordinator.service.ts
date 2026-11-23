import * as crypto from 'node:crypto';

import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { VaatiConfigService } from '@waha/vaati/config/vaati.config';
import { extractOrCreateTraceparent } from '@waha/vaati/observability/tracing.utils';
import { VaatiMetricsService } from '@waha/vaati/observability/vaati-metrics.service';
import { DeadLetterRepository } from '@waha/vaati/repositories/dead-letter.repository';
import { MessageRepository } from '@waha/vaati/repositories/message.repository';
import { QueueRepository } from '@waha/vaati/repositories/queue.repository';
import { VaatiMessageStatus, VaatiQueue } from '@waha/vaati/types/vaati.types';
import { VaatiCircuitBreakerService } from '@waha/vaati/workers/circuit-breaker.service';
import {
  ConsumerHandler,
  ConsumerMessage,
  ConsumerSubscription,
} from '@waha/vaati/workers/consumer-handler.interface';
import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class VaatiWorkerCoordinator implements OnModuleDestroy {
  private workers = new Map<string, Worker>();
  private subscriptions = new Map<string, ConsumerSubscription>();
  private internalHandlers = new Map<string, ConsumerHandler>();
  private redisClient: Redis | null = null;
  private isRedisAvailable = false;

  constructor(
    private readonly config: VaatiConfigService,
    private readonly queueRepo: QueueRepository,
    private readonly messageRepo: MessageRepository,
    private readonly dlqRepo: DeadLetterRepository,
    private readonly circuitBreaker: VaatiCircuitBreakerService,
    @Optional() private readonly metricsService?: VaatiMetricsService,
    @InjectPinoLogger('VaatiWorkerCoordinator') private readonly logger?: PinoLogger,
  ) {
    this.initRedis();
  }

  private initRedis(): void {
    try {
      this.redisClient = new Redis(this.config.redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: true,
      });

      this.redisClient.connect().then(() => {
        this.isRedisAvailable = true;
        this.logger?.info({ redisUrl: this.config.redisUrl }, 'Connected to Redis for worker coordination');
      }).catch((err) => {
        this.isRedisAvailable = false;
        this.logger?.warn({ err: err.message }, 'Redis connection unavailable for worker coordinator');
      });
    } catch (err: any) {
      this.isRedisAvailable = false;
      this.logger?.warn({ err: err.message }, 'Failed to initialize Redis client in coordinator');
    }
  }

  getWorkerKey(tenantId: string, queueName: string): string {
    return `vaati:${tenantId}:${queueName}`;
  }

  registerInternalHandler(handlerName: string, handler: ConsumerHandler): void {
    this.internalHandlers.set(handlerName, handler);
    this.logger?.info({ handler: handlerName }, 'Registered internal consumer handler');
  }

  async subscribe(
    tenantId: string,
    queueName: string,
    options?: {
      targetWebhookUrl?: string;
      internalHandlerName?: string;
      concurrency?: number;
    },
  ): Promise<ConsumerSubscription> {
    const queue = await this.queueRepo.findByName(tenantId, queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found for tenant ${tenantId}`);
    }

    const subId = `sub_${crypto.randomUUID()}`;
    const sub: ConsumerSubscription = {
      id: subId,
      tenantId: tenantId,
      queueName: queueName,
      targetWebhookUrl: options?.targetWebhookUrl,
      internalHandlerName: options?.internalHandlerName,
      concurrency: options?.concurrency ?? queue.concurrencyLimit ?? 50,
      createdAt: new Date(),
    };

    this.subscriptions.set(subId, sub);
    await this.ensureWorkerRunning(tenantId, queueName, queue, sub.concurrency);
    return sub;
  }

  async unsubscribe(subscriptionId: string): Promise<boolean> {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) {
      return false;
    }
    this.subscriptions.delete(subscriptionId);

    // If no more subscriptions for this queue, close worker
    const hasRemaining = Array.from(this.subscriptions.values()).some(
      (s) => s.tenantId === sub.tenantId && s.queueName === sub.queueName,
    );
    if (!hasRemaining) {
      const key = this.getWorkerKey(sub.tenantId, sub.queueName);
      const worker = this.workers.get(key);
      if (worker) {
        await worker.close();
        this.workers.delete(key);
      }
    }
    return true;
  }

  getSubscriptions(tenantId?: string): ConsumerSubscription[] {
    const all = Array.from(this.subscriptions.values());
    if (tenantId) {
      return all.filter((s) => s.tenantId === tenantId);
    }
    return all;
  }

  getActiveWorkers(): Array<{ workerKey: string; running: boolean }> {
    return Array.from(this.workers.keys()).map((k) => ({
      workerKey: k,
      running: true,
    }));
  }

  private async ensureWorkerRunning(
    tenantId: string,
    queueName: string,
    queue: VaatiQueue,
    concurrency: number,
  ): Promise<void> {
    if (!this.isRedisAvailable || !this.redisClient) {
      return;
    }

    const workerKey = this.getWorkerKey(tenantId, queueName);
    if (this.workers.has(workerKey)) {
      return;
    }

    const worker = new Worker(
      workerKey,
      async (job: Job) => {
        return await this.processJob(tenantId, queueName, queue, job);
      },
      {
        connection: this.redisClient,
        concurrency: concurrency,
        lockDuration: 30000,
      },
    );

    this.workers.set(workerKey, worker);
    this.logger?.info({ workerKey: workerKey, concurrency: concurrency }, 'Worker started for queue');
  }

  private async processJob(
    tenantId: string,
    queueName: string,
    queue: VaatiQueue,
    job: Job,
  ): Promise<any> {
    const messageId = String(job.data?.messageId ?? job.id);
    const attemptsMade = job.attemptsMade + 1;
    const maxAttempts = queue.maxAttempts ?? 5;
    const startTime = Date.now();

    // 1. Transition state: DELIVERED_TO_CONSUMER -> PROCESSING
    await this.messageRepo.updateStatus(tenantId, messageId, VaatiMessageStatus.PROCESSING, {
      incrementAttempts: true,
    });

    const headers = job.data?.headers ?? {};
    const traceparent = extractOrCreateTraceparent(headers);

    const consumerMsg: ConsumerMessage = {
      messageId: messageId,
      tenantId: tenantId,
      exchange: job.data?.exchange ?? '',
      routingKey: job.data?.routingKey ?? '',
      correlationId: job.data?.correlationId,
      headers: headers,
      payload: job.data?.payload ?? job.data,
      attemptsMade: attemptsMade,
    };

    // Find subscriptions for this queue
    const subs = Array.from(this.subscriptions.values()).filter(
      (s) => s.tenantId === tenantId && s.queueName === queueName,
    );

    try {
      for (const sub of subs) {
        if (sub.internalHandlerName) {
          const handler = this.internalHandlers.get(sub.internalHandlerName);
          if (handler) {
            await handler(consumerMsg);
          }
        }
        if (sub.targetWebhookUrl) {
          await this.dispatchWebhook(sub.targetWebhookUrl, consumerMsg, traceparent);
        }
      }

      // 2. Successful execution: ACK
      await this.messageRepo.updateStatus(tenantId, messageId, VaatiMessageStatus.ACKNOWLEDGED);
      const durationSeconds = (Date.now() - startTime) / 1000;

      this.metricsService?.recordConsumed(tenantId, queueName, 'ack');
      this.metricsService?.observeDuration(tenantId, queueName, durationSeconds);

      this.logger?.debug({ messageId: messageId, queue: queueName, durationSeconds: durationSeconds }, 'Message processed and ACKNOWLEDGED');
      return { success: true };
    } catch (err: any) {
      // 3. Failure Handling: Retry or DLQ
      const isTerminal = attemptsMade >= maxAttempts;

      if (isTerminal) {
        await this.handleDeadLetter(tenantId, queue, messageId, consumerMsg, err, attemptsMade);
        this.metricsService?.recordConsumed(tenantId, queueName, 'dead_letter');
        this.logger?.error(
          { messageId: messageId, queue: queueName, attemptsMade: attemptsMade, error: err.message },
          'Message processing failed terminally; moved to DEAD_LETTERED',
        );
      } else {
        await this.messageRepo.updateStatus(tenantId, messageId, VaatiMessageStatus.RETRY_SCHEDULED, {
          errorSummary: err.message,
        });
        this.metricsService?.recordConsumed(tenantId, queueName, 'retry');
        this.logger?.warn(
          { messageId: messageId, queue: queueName, attemptsMade: attemptsMade, error: err.message },
          'Message processing failed; RETRY_SCHEDULED',
        );
      }

      throw err;
    }
  }

  private async dispatchWebhook(webhookUrl: string, msg: ConsumerMessage, traceparent: string): Promise<void> {
    if (!this.circuitBreaker.canExecute(webhookUrl)) {
      throw new Error(`Circuit breaker is OPEN for webhook target: ${webhookUrl}`);
    }

    const payloadStr = JSON.stringify(msg);
    const signature = crypto.createHmac('sha256', this.config.masterApiKey).update(payloadStr).digest('hex');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vaati-Signature': signature,
          'X-Vaati-Message-Id': msg.messageId,
          'X-Vaati-Routing-Key': msg.routingKey,
          'traceparent': traceparent,
        },
        body: payloadStr,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Webhook returned HTTP error status ${response.status}`);
      }

      this.circuitBreaker.recordSuccess(webhookUrl);
    } catch (err: any) {
      clearTimeout(timeout);
      this.circuitBreaker.recordFailure(webhookUrl);
      throw err;
    }
  }

  private async handleDeadLetter(
    tenantId: string,
    queue: VaatiQueue,
    messageId: string,
    msg: ConsumerMessage,
    error: Error,
    attemptsMade: number,
  ): Promise<void> {
    const now = new Date();
    await this.messageRepo.updateStatus(tenantId, messageId, VaatiMessageStatus.DEAD_LETTERED, {
      errorSummary: error.message,
    });

    await this.dlqRepo.create({
      id: `dlq_${crypto.randomUUID()}`,
      tenantId: tenantId,
      messageId: messageId,
      originalQueue: queue.name,
      originalExchange: msg.exchange,
      routingKey: msg.routingKey,
      payload: msg.payload,
      headers: msg.headers,
      failureReason: error.message,
      stackTrace: error.stack ?? null,
      redeliveryCount: attemptsMade,
      firstFailedAt: now,
      lastFailedAt: now,
    });
  }

  async onModuleDestroy(): Promise<void> {
    for (const [key, worker] of this.workers.entries()) {
      try {
        await worker.close();
      } catch (err: any) {
        this.logger?.warn({ key: key, err: err.message }, 'Error closing worker during shutdown');
      }
    }
    this.workers.clear();

    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch (err: any) {
        this.logger?.warn({ err: err.message }, 'Error closing Redis client in coordinator');
      }
    }
  }
}
