import * as crypto from 'node:crypto';

import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { VaatiQueueService } from '@waha/vaati/broker/queues/vaati-queue.service';
import { ExchangeRouterService } from '@waha/vaati/broker/routing/exchange-router';
import { matchTopic } from '@waha/vaati/broker/routing/topic-matcher';
import { extractOrCreateTraceparent, injectTraceparent } from '@waha/vaati/observability/tracing.utils';
import { VaatiMetricsService } from '@waha/vaati/observability/vaati-metrics.service';
import { VaatiRateLimitService } from '@waha/vaati/rate-limit/vaati-rate-limit.service';
import { MessageRepository } from '@waha/vaati/repositories/message.repository';
import { TenantRepository } from '@waha/vaati/repositories/tenant.repository';
import {
  VaatiAuthContext,
  VaatiMessageStatus,
  VaatiRole,
  VaatiTenantStatus,
} from '@waha/vaati/types/vaati.types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { PublishMessageDto } from './publisher.dto';

export interface PublishResult {
  success: boolean;
  messageId: string;
  status: VaatiMessageStatus;
  routedQueues: string[];
  duplicate?: boolean;
  timestamp: string;
}

@Injectable()
export class VaatiPublisherService {
  constructor(
    private readonly messageRepo: MessageRepository,
    private readonly tenantRepo: TenantRepository,
    private readonly routerService: ExchangeRouterService,
    private readonly queueService: VaatiQueueService,
    private readonly rateLimitService: VaatiRateLimitService,
    @Optional() private readonly metricsService?: VaatiMetricsService,
    @InjectPinoLogger('VaatiPublisherService') private readonly logger?: PinoLogger,
  ) {}

  async publish(dto: PublishMessageDto, auth: VaatiAuthContext): Promise<PublishResult> {
    const targetTenantId = dto.tenantId ?? auth.tenantId;

    // Cross-tenant protection
    if (auth.actorRole !== VaatiRole.ADMIN && targetTenantId !== auth.tenantId) {
      throw new ForbiddenException('Actors without ADMIN role cannot publish to other tenants');
    }

    // Permission check for allowed exchanges
    if (!this.isExchangeAllowed(auth.allowedExchanges, dto.exchange)) {
      throw new ForbiddenException(`API Key not permitted to publish to exchange ${dto.exchange}`);
    }

    // Tenant active check
    const tenant = await this.tenantRepo.findById(targetTenantId);
    if (!tenant || tenant.status !== VaatiTenantStatus.ACTIVE) {
      throw new ForbiddenException(`Tenant ${targetTenantId} is not active`);
    }

    // Rate limit check
    const rateCheck = await this.rateLimitService.checkRateLimit(targetTenantId, tenant.rateLimitPerMinute);
    if (!rateCheck.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Tenant publish rate limit exceeded',
          retryAfterMs: rateCheck.resetMs,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Idempotency check
    if (dto.idempotencyKey) {
      const existing = await this.messageRepo.findByIdempotencyKey(targetTenantId, dto.idempotencyKey);
      if (existing) {
        this.logger?.info(
          { tenantId: targetTenantId, idempotencyKey: dto.idempotencyKey, messageId: existing.id },
          'Duplicate message detected via idempotency key; returning existing record',
        );
        return {
          success: true,
          messageId: existing.id,
          status: existing.status,
          routedQueues: [],
          duplicate: true,
          timestamp: existing.createdAt.toISOString(),
        };
      }
    }

    const messageId = dto.messageId ?? `msg_${crypto.randomUUID()}`;
    const opts = dto.options ?? {};
    const now = new Date().toISOString();

    // W3C Traceparent injection
    const headers = { ...(dto.headers ?? {}) };
    const traceparent = extractOrCreateTraceparent(headers);
    injectTraceparent(headers, traceparent);

    // 1. Transactional Outbox: Persist durable message
    await this.messageRepo.create({
      id: messageId,
      tenantId: targetTenantId,
      exchangeName: dto.exchange,
      routingKey: dto.routingKey,
      correlationId: dto.correlationId ?? null,
      causationId: dto.causationId ?? null,
      idempotencyKey: dto.idempotencyKey ?? null,
      headers: headers,
      payload: dto.payload,
      priority: opts.priority ?? 0,
      ttlMs: opts.ttl ?? null,
      maxAttempts: opts.maxAttempts ?? 5,
      status: VaatiMessageStatus.PERSISTED,
    });

    this.metricsService?.recordPublished(targetTenantId, dto.exchange, 'PERSISTED');

    // 2. Exchange Routing: evaluate bound queues
    const matchedQueues = await this.routerService.routeMessage(
      targetTenantId,
      dto.exchange,
      dto.routingKey,
      headers,
    );

    // Mandatory routing check
    if (opts.mandatory && matchedQueues.length === 0) {
      await this.messageRepo.updateStatus(targetTenantId, messageId, VaatiMessageStatus.FAILED, {
        errorSummary: 'Mandatory message could not be routed to any bound queue',
      });
      throw new UnprocessableEntityException(
        `Mandatory message could not be routed to any bound queue on exchange ${dto.exchange}`,
      );
    }

    // 3. Queue Dispatch: Enqueue into BullMQ for each bound destination queue
    for (const queueName of matchedQueues) {
      await this.queueService.enqueueMessage(targetTenantId, queueName, messageId, {
        messageId: messageId,
        tenantId: targetTenantId,
        exchange: dto.exchange,
        routingKey: dto.routingKey,
        correlationId: dto.correlationId,
        headers: headers,
        payload: dto.payload,
      }, {
        priority: opts.priority,
        delay: opts.delay,
        ttl: opts.ttl,
        maxAttempts: opts.maxAttempts,
      });

      this.metricsService?.recordRouted(targetTenantId, dto.exchange, queueName);
    }

    // 4. Update status to ROUTED
    const finalStatus = matchedQueues.length > 0 ? VaatiMessageStatus.ROUTED : VaatiMessageStatus.PERSISTED;
    await this.messageRepo.updateStatus(targetTenantId, messageId, finalStatus);

    this.logger?.info(
      { tenantId: targetTenantId, exchange: dto.exchange, routingKey: dto.routingKey, messageId: messageId, routedQueues: matchedQueues },
      'Message successfully routed',
    );

    return {
      success: true,
      messageId: messageId,
      status: finalStatus,
      routedQueues: matchedQueues,
      timestamp: now,
    };
  }

  private isExchangeAllowed(allowedExchanges: string[], exchange: string): boolean {
    if (!allowedExchanges || allowedExchanges.length === 0) {
      return false;
    }
    for (const pattern of allowedExchanges) {
      if (pattern === '*' || pattern === exchange) {
        return true;
      }
      if (matchTopic(pattern, exchange)) {
        return true;
      }
    }
    return false;
  }
}
