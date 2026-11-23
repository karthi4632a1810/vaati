import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { VaatiConfigService } from '@waha/vaati/config/vaati.config';
import { QueueRepository } from '@waha/vaati/repositories/queue.repository';
import { VaatiQueueState } from '@waha/vaati/types/vaati.types';
import { JobsOptions, Queue } from 'bullmq';
import Redis from 'ioredis';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

export interface QueueJobCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

@Injectable()
export class VaatiQueueService implements OnModuleDestroy {
  private queues = new Map<string, Queue>();
  private redisClient: Redis | null = null;
  private isRedisAvailable = false;

  constructor(
    private readonly config: VaatiConfigService,
    private readonly queueRepo: QueueRepository,
    @InjectPinoLogger('VaatiQueueService') private readonly logger: PinoLogger,
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
        this.logger.info({ redisUrl: this.config.redisUrl }, 'Connected to Redis for BullMQ queues');
      }).catch((err) => {
        this.isRedisAvailable = false;
        this.logger.warn({ err: err.message }, 'Redis connection not available, queue service running in fallback mode');
      });
    } catch (err: any) {
      this.isRedisAvailable = false;
      this.logger.warn({ err: err.message }, 'Failed to initialize Redis client for queues');
    }
  }

  getQueueKey(tenantId: string, queueName: string): string {
    return `${tenantId}_${queueName}`;
  }

  getOrCreateQueue(tenantId: string, queueName: string): Queue | null {
    if (!this.isRedisAvailable || !this.redisClient) {
      return null;
    }

    const key = this.getQueueKey(tenantId, queueName);
    let queue = this.queues.get(key);
    if (!queue) {
      queue = new Queue(key, {
        connection: this.redisClient,
        prefix: 'vaati',
        defaultJobOptions: {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: {
            age: 86400,
            count: 5000,
          },
          removeOnFail: {
            age: 604800,
            count: 10000,
          },
        },
      });
      this.queues.set(key, queue);
    }
    return queue;
  }

  async enqueueMessage(
    tenantId: string,
    queueName: string,
    messageId: string,
    payload: any,
    options?: {
      priority?: number;
      delay?: number;
      ttl?: number;
      maxAttempts?: number;
    },
  ): Promise<{ enqueued: boolean; jobId: string }> {
    const queue = this.getOrCreateQueue(tenantId, queueName);
    if (!queue) {
      this.logger.warn({ tenantId: tenantId, queueName: queueName }, 'Redis offline, job registered in outbox only');
      return { enqueued: false, jobId: messageId };
    }

    const jobOpts: JobsOptions = {
      jobId: messageId,
      priority: options?.priority ? Math.min(Math.max(options.priority, 1), 10) : undefined,
      delay: options?.delay,
      attempts: options?.maxAttempts ?? 5,
    };

    const job = await queue.add('process_message', payload, jobOpts);
    return { enqueued: true, jobId: String(job.id) };
  }

  async pauseQueue(tenantId: string, queueName: string): Promise<void> {
    const queue = this.getOrCreateQueue(tenantId, queueName);
    if (queue) {
      await queue.pause();
    }
    await this.queueRepo.updateState(tenantId, queueName, VaatiQueueState.PAUSED);
  }

  async resumeQueue(tenantId: string, queueName: string): Promise<void> {
    const queue = this.getOrCreateQueue(tenantId, queueName);
    if (queue) {
      await queue.resume();
    }
    await this.queueRepo.updateState(tenantId, queueName, VaatiQueueState.ACTIVE);
  }

  async purgeQueue(tenantId: string, queueName: string): Promise<{ purged: boolean }> {
    const queue = this.getOrCreateQueue(tenantId, queueName);
    if (queue) {
      await queue.drain();
      return { purged: true };
    }
    return { purged: false };
  }

  async getQueueMetrics(tenantId: string, queueName: string): Promise<QueueJobCounts> {
    const queue = this.getOrCreateQueue(tenantId, queueName);
    if (!queue) {
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 };
    }

    const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
      paused: counts.paused ?? 0,
    };
  }

  async deleteQueue(tenantId: string, queueName: string): Promise<void> {
    const key = this.getQueueKey(tenantId, queueName);
    const queue = this.queues.get(key);
    if (queue) {
      await queue.obliterate({ force: true });
      await queue.close();
      this.queues.delete(key);
    }
    await this.queueRepo.delete(tenantId, queueName);
  }

  async onModuleDestroy(): Promise<void> {
    for (const [key, queue] of this.queues.entries()) {
      try {
        await queue.close();
      } catch (err: any) {
        this.logger.warn({ key: key, err: err.message }, 'Error closing queue');
      }
    }
    this.queues.clear();

    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch (err: any) {
        this.logger.warn({ err: err.message }, 'Error quitting Redis client');
      }
    }
  }
}
