import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { VaatiQueueService } from '@waha/vaati/broker/queues/vaati-queue.service';
import { ExchangeRouterService } from '@waha/vaati/broker/routing/exchange-router';
import { VaatiConfigService } from '@waha/vaati/config/vaati.config';
import { MessageRepository } from '@waha/vaati/repositories/message.repository';
import { VaatiMessageStatus } from '@waha/vaati/types/vaati.types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class VaatiOutboxWorkerService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor(
    private readonly config: VaatiConfigService,
    private readonly messageRepo: MessageRepository,
    private readonly routerService: ExchangeRouterService,
    private readonly queueService: VaatiQueueService,
    @InjectPinoLogger('VaatiOutboxWorkerService') private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    if (!this.config.isEnabled) {
      return;
    }
    const intervalMs = 2000;
    this.timer = setInterval(() => {
      this.pollAndDispatch().catch((err) => {
        this.logger.error({ err: err.message }, 'Unhandled error in outbox worker polling cycle');
      });
    }, intervalMs);
    this.logger.info({ intervalMs: intervalMs }, 'Transactional outbox background worker initialized');
  }

  async pollAndDispatch(batchSize: number = 50): Promise<number> {
    if (this.isProcessing) {
      return 0;
    }
    this.isProcessing = true;

    try {
      const pending = await this.messageRepo.findPendingOutbox(batchSize);
      if (pending.length === 0) {
        return 0;
      }

      this.logger.debug({ count: pending.length }, 'Outbox worker picked up unrouted persisted messages');
      let dispatchedCount = 0;

      for (const msg of pending) {
        try {
          const matchedQueues = await this.routerService.routeMessage(
            msg.tenantId,
            msg.exchangeName,
            msg.routingKey,
            msg.headers,
          );

          if (matchedQueues.length > 0) {
            for (const queueName of matchedQueues) {
              await this.queueService.enqueueMessage(
                msg.tenantId,
                queueName,
                msg.id,
                {
                  messageId: msg.id,
                  tenantId: msg.tenantId,
                  exchange: msg.exchangeName,
                  routingKey: msg.routingKey,
                  correlationId: msg.correlationId,
                  headers: msg.headers,
                  payload: msg.payload,
                },
                {
                  priority: msg.priority,
                  ttl: msg.ttlMs ?? undefined,
                  maxAttempts: msg.maxAttempts,
                },
              );
            }
            await this.messageRepo.updateStatus(msg.tenantId, msg.id, VaatiMessageStatus.ROUTED);
            dispatchedCount++;
          }
        } catch (err: any) {
          this.logger.warn(
            { messageId: msg.id, tenantId: msg.tenantId, err: err.message },
            'Failed to dispatch message from outbox batch',
          );
        }
      }

      return dispatchedCount;
    } finally {
      this.isProcessing = false;
    }
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.info('Transactional outbox background worker stopped');
    }
  }
}
