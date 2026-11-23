import { createVaatiSchema } from '@waha/vaati/database/schema';
import { VaatiDatabaseService } from '@waha/vaati/database/vaati.database';
import { ApiKeyRepository } from '@waha/vaati/repositories/api-key.repository';
import { AuditLogRepository } from '@waha/vaati/repositories/audit-log.repository';
import { BindingRepository } from '@waha/vaati/repositories/binding.repository';
import { DeadLetterRepository } from '@waha/vaati/repositories/dead-letter.repository';
import { ExchangeRepository } from '@waha/vaati/repositories/exchange.repository';
import { MessageRepository } from '@waha/vaati/repositories/message.repository';
import { QueueRepository } from '@waha/vaati/repositories/queue.repository';
import { TenantRepository } from '@waha/vaati/repositories/tenant.repository';
import {
  VaatiExchangeType,
  VaatiMessageStatus,
  VaatiQueueState,
  VaatiRole,
  VaatiTenantStatus,
} from '@waha/vaati/types/vaati.types';
import Knex, { Knex as KnexType } from 'knex';

describe('VAATI Repositories Test Suite', () => {
  let knex: KnexType;
  let dbService: VaatiDatabaseService;

  let tenantRepo: TenantRepository;
  let apiKeyRepo: ApiKeyRepository;
  let exchangeRepo: ExchangeRepository;
  let queueRepo: QueueRepository;
  let bindingRepo: BindingRepository;
  let messageRepo: MessageRepository;
  let dlqRepo: DeadLetterRepository;
  let auditRepo: AuditLogRepository;

  beforeAll(async () => {
    knex = Knex({
      client: 'better-sqlite3',
      connection: {
        filename: ':memory:',
      },
      useNullAsDefault: true,
    });
    await createVaatiSchema(knex);

    dbService = { knex: knex } as any;

    tenantRepo = new TenantRepository(dbService);
    apiKeyRepo = new ApiKeyRepository(dbService);
    exchangeRepo = new ExchangeRepository(dbService);
    queueRepo = new QueueRepository(dbService);
    bindingRepo = new BindingRepository(dbService);
    messageRepo = new MessageRepository(dbService);
    dlqRepo = new DeadLetterRepository(dbService);
    auditRepo = new AuditLogRepository(dbService);
  });

  afterAll(async () => {
    await knex.destroy();
  });

  describe('TenantRepository', () => {
    test('creates and retrieves tenant with default quotas', async () => {
      const tenant = await tenantRepo.create({
        id: 'hosp-001',
        name: 'Apollo Hospital Core',
        rateLimitPerMinute: 12000,
      });

      expect(tenant.id).toBe('hosp-001');
      expect(tenant.name).toBe('Apollo Hospital Core');
      expect(tenant.rateLimitPerMinute).toBe(12000);
      expect(tenant.status).toBe(VaatiTenantStatus.ACTIVE);

      const retrieved = await tenantRepo.findById('hosp-001');
      expect(retrieved?.id).toBe('hosp-001');
    });

    test('updates tenant status and quotas', async () => {
      await tenantRepo.updateStatus('hosp-001', VaatiTenantStatus.SUSPENDED);
      let t = await tenantRepo.findById('hosp-001');
      expect(t?.status).toBe(VaatiTenantStatus.SUSPENDED);

      await tenantRepo.updateStatus('hosp-001', VaatiTenantStatus.ACTIVE);
      await tenantRepo.updateQuotas('hosp-001', { rateLimitPerMinute: 20000, maxQueues: 150 });

      t = await tenantRepo.findById('hosp-001');
      expect(t?.rateLimitPerMinute).toBe(20000);
      expect(t?.maxQueues).toBe(150);
    });
  });

  describe('ApiKeyRepository', () => {
    test('creates API key and finds by raw key via SHA-256 hash', async () => {
      const rawSecret = 'vaati_sec_test_random_123456';
      const { apiKey } = await apiKeyRepo.create({
        id: 'key-test-1',
        tenantId: 'hosp-001',
        rawKey: rawSecret,
        role: VaatiRole.PUBLISHER,
        allowedExchanges: ['hospital.*'],
        allowedQueues: ['lab.*'],
      });

      expect(apiKey.id).toBe('key-test-1');
      expect(apiKey.role).toBe(VaatiRole.PUBLISHER);
      expect(apiKey.keyPrefix).toBe(rawSecret.slice(0, 8));

      const found = await apiKeyRepo.findByRawKey(rawSecret);
      expect(found).not.toBeNull();
      expect(found?.id).toBe('key-test-1');
      expect(found?.allowedExchanges).toEqual(['hospital.*']);

      const notFound = await apiKeyRepo.findByRawKey('wrong_key');
      expect(notFound).toBeNull();
    });

    test('revokes API key successfully', async () => {
      await apiKeyRepo.revoke('key-test-1');
      const found = await apiKeyRepo.findById('key-test-1');
      expect(found).toBeNull();
    });
  });

  describe('Exchange & Queue & Binding Repositories', () => {
    test('declares exchange, queue, and binds them with topic key', async () => {
      const exchange = await exchangeRepo.declare({
        id: 'ex-events',
        tenantId: 'hosp-001',
        name: 'hospital.events',
        type: VaatiExchangeType.TOPIC,
      });
      expect(exchange.name).toBe('hospital.events');
      expect(exchange.type).toBe(VaatiExchangeType.TOPIC);

      const queue = await queueRepo.declare({
        id: 'q-lis-orders',
        tenantId: 'hosp-001',
        name: 'lis.orders.queue',
        priority: true,
      });
      expect(queue.name).toBe('lis.orders.queue');
      expect(queue.state).toBe(VaatiQueueState.ACTIVE);

      const binding = await bindingRepo.bind({
        id: 'bind-1',
        tenantId: 'hosp-001',
        exchangeName: 'hospital.events',
        queueName: 'lis.orders.queue',
        bindingKey: 'lab.order.#',
      });
      expect(binding.bindingKey).toBe('lab.order.#');

      const bindings = await bindingRepo.findByExchange('hosp-001', 'hospital.events');
      expect(bindings.length).toBe(1);
      expect(bindings[0].queueName).toBe('lis.orders.queue');
    });
  });

  describe('MessageRepository (Transactional Outbox)', () => {
    test('persists message with idempotency key and updates status', async () => {
      const msg = await messageRepo.create({
        id: 'msg-001',
        tenantId: 'hosp-001',
        exchangeName: 'hospital.events',
        routingKey: 'lab.order.created',
        idempotencyKey: 'order_ref_101',
        payload: { orderId: 'ORD101', patient: 'PAT99' },
        priority: 5,
      });

      expect(msg.status).toBe(VaatiMessageStatus.PERSISTED);
      expect(msg.payload.orderId).toBe('ORD101');

      const foundByIdempotency = await messageRepo.findByIdempotencyKey('hosp-001', 'order_ref_101');
      expect(foundByIdempotency?.id).toBe('msg-001');

      const outbox = await messageRepo.findPendingOutbox();
      expect(outbox.some((m) => m.id === 'msg-001')).toBe(true);

      await messageRepo.updateStatus('hosp-001', 'msg-001', VaatiMessageStatus.ACKNOWLEDGED, {
        incrementAttempts: true,
      });

      const updated = await messageRepo.findById('hosp-001', 'msg-001');
      expect(updated?.status).toBe(VaatiMessageStatus.ACKNOWLEDGED);
      expect(updated?.attemptsMade).toBe(1);
    });
  });

  describe('DeadLetterRepository & AuditLogRepository', () => {
    test('records dead letter and marks as replayed', async () => {
      const dlq = await dlqRepo.create({
        id: 'dlq-001',
        tenantId: 'hosp-001',
        messageId: 'msg-001',
        originalQueue: 'lis.orders.queue',
        originalExchange: 'hospital.events',
        routingKey: 'lab.order.created',
        payload: { orderId: 'ORD101' },
        failureReason: 'Downstream HIS timeout (504 Gateway Timeout)',
        stackTrace: 'Error: timeout at HttpClient.post',
        redeliveryCount: 5,
        firstFailedAt: new Date(Date.now() - 3600000),
        lastFailedAt: new Date(),
      });

      expect(dlq.failureReason).toContain('Downstream HIS timeout');
      expect(dlq.replayed).toBe(false);

      const dlqList = await dlqRepo.findByTenant('hosp-001');
      expect(dlqList.total).toBe(1);

      await dlqRepo.markReplayed('hosp-001', 'dlq-001');
      const replayed = await dlqRepo.findById('hosp-001', 'dlq-001');
      expect(replayed?.replayed).toBe(true);
    });

    test('records and queries immutable audit logs', async () => {
      await auditRepo.log({
        tenantId: 'hosp-001',
        actorId: 'admin_usr',
        actorRole: VaatiRole.ADMIN,
        action: 'QUEUE_PURGED',
        resourceType: 'QUEUE',
        resourceId: 'lis.orders.queue',
        details: { purgedCount: 42 },
      });

      const logs = await auditRepo.findByTenant('hosp-001');
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].action).toBe('QUEUE_PURGED');
      expect(logs[0].details?.purgedCount).toBe(42);
    });
  });
});
