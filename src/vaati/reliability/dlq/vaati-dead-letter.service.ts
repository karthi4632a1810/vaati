import { Injectable, NotFoundException } from '@nestjs/common';
import { VaatiPublisherService } from '@waha/vaati/broker/publisher/vaati-publisher.service';
import { AuditLogRepository } from '@waha/vaati/repositories/audit-log.repository';
import { DeadLetterRepository } from '@waha/vaati/repositories/dead-letter.repository';
import { VaatiAuthContext, VaatiDeadLetter } from '@waha/vaati/types/vaati.types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { BulkReplayDeadLetterDto, ReplayDeadLetterDto } from './dto/dead-letter.dto';

@Injectable()
export class VaatiDeadLetterService {
  constructor(
    private readonly dlqRepo: DeadLetterRepository,
    private readonly publisherService: VaatiPublisherService,
    private readonly auditRepo: AuditLogRepository,
    @InjectPinoLogger('VaatiDeadLetterService') private readonly logger: PinoLogger,
  ) {}

  async listDeadLetters(
    tenantId: string,
    options?: {
      queue?: string;
      replayed?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ items: VaatiDeadLetter[]; total: number }> {
    return await this.dlqRepo.findByTenant(tenantId, options);
  }

  async getDeadLetter(tenantId: string, id: string): Promise<VaatiDeadLetter> {
    const dl = await this.dlqRepo.findById(tenantId, id);
    if (!dl) {
      throw new NotFoundException(`Dead letter record ${id} not found`);
    }
    return dl;
  }

  async replayMessage(
    tenantId: string,
    id: string,
    dto?: ReplayDeadLetterDto,
    auth?: VaatiAuthContext,
  ): Promise<{ success: boolean; newMessageId: string }> {
    const dl = await this.getDeadLetter(tenantId, id);

    const targetExchange = dto?.targetExchange || dl.originalExchange;
    const targetRoutingKey = dto?.targetRoutingKey || dl.routingKey;

    const pubResult = await this.publisherService.publish(
      {
        exchange: targetExchange,
        routingKey: targetRoutingKey,
        tenantId: tenantId,
        headers: {
          ...(dl.headers ?? {}),
          'x-vaati-replayed-from': dl.id,
          'x-vaati-original-queue': dl.originalQueue,
        },
        payload: dl.payload,
      },
      auth ?? {
        tenantId: tenantId,
        actorId: 'dlq_replay_system',
        actorRole: (auth?.actorRole as any) ?? 'ADMIN',
        apiKeyId: null,
        allowedExchanges: ['*'],
        allowedQueues: ['*'],
      },
    );

    await this.dlqRepo.markReplayed(tenantId, id);

    if (auth) {
      await this.auditRepo.log({
        tenantId: tenantId,
        actorId: auth.actorId,
        actorRole: auth.actorRole,
        action: 'DEAD_LETTER_REPLAYED',
        resourceType: 'DEAD_LETTER',
        resourceId: id,
        details: { newMessageId: pubResult.messageId, targetExchange: targetExchange },
      });
    }

    this.logger.info(
      { deadLetterId: id, newMessageId: pubResult.messageId, targetExchange: targetExchange },
      'Dead letter message successfully replayed',
    );

    return {
      success: true,
      newMessageId: pubResult.messageId,
    };
  }

  async bulkReplay(
    tenantId: string,
    filter: BulkReplayDeadLetterDto,
    auth: VaatiAuthContext,
  ): Promise<{ replayedCount: number; replayedIds: string[] }> {
    const queryRes = await this.dlqRepo.findByTenant(tenantId, {
      queue: filter.queue,
      replayed: false,
      limit: filter.limit ?? 50,
    });

    let candidates = queryRes.items;
    if (filter.failurePattern) {
      const pattern = filter.failurePattern.toLowerCase();
      candidates = candidates.filter((item) =>
        item.failureReason.toLowerCase().includes(pattern),
      );
    }

    const replayedIds: string[] = [];

    for (const item of candidates) {
      try {
        await this.replayMessage(tenantId, item.id, undefined, auth);
        replayedIds.push(item.id);
      } catch (err: any) {
        this.logger.warn({ id: item.id, err: err.message }, 'Failed to replay dead letter in bulk batch');
      }
    }

    await this.auditRepo.log({
      tenantId: tenantId,
      actorId: auth.actorId,
      actorRole: auth.actorRole,
      action: 'DEAD_LETTER_BULK_REPLAYED',
      resourceType: 'DEAD_LETTER',
      resourceId: `batch_${replayedIds.length}`,
      details: { replayedCount: replayedIds.length, replayedIds: replayedIds },
    });

    return {
      replayedCount: replayedIds.length,
      replayedIds: replayedIds,
    };
  }

  async discard(
    tenantId: string,
    id: string,
    auth: VaatiAuthContext,
  ): Promise<{ success: boolean }> {
    const dl = await this.getDeadLetter(tenantId, id);
    await this.dlqRepo.delete(tenantId, id);

    await this.auditRepo.log({
      tenantId: tenantId,
      actorId: auth.actorId,
      actorRole: auth.actorRole,
      action: 'DEAD_LETTER_DISCARDED',
      resourceType: 'DEAD_LETTER',
      resourceId: id,
      details: { originalQueue: dl.originalQueue, reason: dl.failureReason },
    });

    this.logger.info({ deadLetterId: id, tenantId: tenantId }, 'Dead letter permanently discarded');
    return { success: true };
  }
}
