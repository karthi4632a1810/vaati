import { Module } from '@nestjs/common';
import { VaatiApiKeyGuard } from '@waha/vaati/auth/vaati-api-key.guard';
import { VaatiRbacGuard } from '@waha/vaati/auth/vaati-rbac.guard';
import { VaatiPublisherService } from '@waha/vaati/broker/publisher/vaati-publisher.service';
import { VaatiQueueService } from '@waha/vaati/broker/queues/vaati-queue.service';
import { ExchangeRouterService } from '@waha/vaati/broker/routing/exchange-router';
import { VaatiConfigService } from '@waha/vaati/config/vaati.config';
import { VaatiApiKeysController } from '@waha/vaati/controllers/vaati.apikeys.controller';
import { VaatiExchangesController } from '@waha/vaati/controllers/vaati.exchanges.controller';
import { VaatiHealthController } from '@waha/vaati/controllers/vaati.health.controller';
import { VaatiMessagesController } from '@waha/vaati/controllers/vaati.messages.controller';
import { VaatiQueuesController } from '@waha/vaati/controllers/vaati.queues.controller';
import { VaatiTenantsController } from '@waha/vaati/controllers/vaati.tenants.controller';
import { VaatiDatabaseService } from '@waha/vaati/database/vaati.database';
import { VaatiRateLimitService } from '@waha/vaati/rate-limit/vaati-rate-limit.service';
import { ApiKeyRepository } from '@waha/vaati/repositories/api-key.repository';
import { AuditLogRepository } from '@waha/vaati/repositories/audit-log.repository';
import { BindingRepository } from '@waha/vaati/repositories/binding.repository';
import { DeadLetterRepository } from '@waha/vaati/repositories/dead-letter.repository';
import { ExchangeRepository } from '@waha/vaati/repositories/exchange.repository';
import { MessageRepository } from '@waha/vaati/repositories/message.repository';
import { QueueRepository } from '@waha/vaati/repositories/queue.repository';
import { TenantRepository } from '@waha/vaati/repositories/tenant.repository';

@Module({
  imports: [],
  controllers: [
    VaatiHealthController,
    VaatiTenantsController,
    VaatiApiKeysController,
    VaatiExchangesController,
    VaatiQueuesController,
    VaatiMessagesController,
  ],
  providers: [
    VaatiConfigService,
    VaatiDatabaseService,
    TenantRepository,
    ApiKeyRepository,
    ExchangeRepository,
    QueueRepository,
    BindingRepository,
    MessageRepository,
    DeadLetterRepository,
    AuditLogRepository,
    VaatiRateLimitService,
    VaatiApiKeyGuard,
    VaatiRbacGuard,
    ExchangeRouterService,
    VaatiQueueService,
    VaatiPublisherService,
  ],
  exports: [
    VaatiConfigService,
    VaatiDatabaseService,
    TenantRepository,
    ApiKeyRepository,
    ExchangeRepository,
    QueueRepository,
    BindingRepository,
    MessageRepository,
    DeadLetterRepository,
    AuditLogRepository,
    VaatiRateLimitService,
    VaatiApiKeyGuard,
    VaatiRbacGuard,
    ExchangeRouterService,
    VaatiQueueService,
    VaatiPublisherService,
  ],
})
export class VaatiModule {}
