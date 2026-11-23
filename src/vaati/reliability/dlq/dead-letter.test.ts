import { VaatiDeadLetterService } from '@waha/vaati/reliability/dlq/vaati-dead-letter.service';
import { VaatiAuthContext, VaatiDeadLetter, VaatiRole } from '@waha/vaati/types/vaati.types';

describe('VaatiDeadLetterService', () => {
  let dlqService: VaatiDeadLetterService;
  let mockDlqRepo: any;
  let mockPublisherService: any;
  let mockAuditRepo: any;
  let mockLogger: any;

  const authContext: VaatiAuthContext = {
    tenantId: 'hosp-001',
    actorId: 'admin_usr',
    actorRole: VaatiRole.ADMIN,
    apiKeyId: 'key-1',
    allowedExchanges: ['*'],
    allowedQueues: ['*'],
  };

  const sampleDeadLetter: VaatiDeadLetter = {
    id: 'dlq_test_101',
    tenantId: 'hosp-001',
    messageId: 'msg_failed_01',
    originalQueue: 'lis.orders.queue',
    originalExchange: 'hospital.events',
    routingKey: 'lab.order.created',
    payload: { orderId: 'ORD-101' },
    headers: { channel: 'HL7' },
    failureReason: '504 Gateway Timeout connecting to LIS server',
    stackTrace: 'Error: timeout at HttpClient',
    redeliveryCount: 5,
    firstFailedAt: new Date(Date.now() - 3600000),
    lastFailedAt: new Date(),
    replayed: false,
    replayedAt: null,
    createdAt: new Date(),
  };

  beforeEach(() => {
    mockDlqRepo = {
      findById: jest.fn().mockResolvedValue(sampleDeadLetter),
      findByTenant: jest.fn().mockResolvedValue({ items: [sampleDeadLetter], total: 1 }),
      markReplayed: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(true),
    };

    mockPublisherService = {
      publish: jest.fn().mockResolvedValue({
        success: true,
        messageId: 'msg_replayed_new_999',
        status: 'ROUTED',
        routedQueues: ['lis.orders.queue'],
      }),
    };

    mockAuditRepo = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    dlqService = new VaatiDeadLetterService(
      mockDlqRepo,
      mockPublisherService,
      mockAuditRepo,
      mockLogger,
    );
  });

  test('replays individual dead letter message into exchange', async () => {
    const res = await dlqService.replayMessage('hosp-001', 'dlq_test_101', undefined, authContext);

    expect(res.success).toBe(true);
    expect(res.newMessageId).toBe('msg_replayed_new_999');

    expect(mockPublisherService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        exchange: 'hospital.events',
        routingKey: 'lab.order.created',
        payload: { orderId: 'ORD-101' },
      }),
      authContext,
    );

    expect(mockDlqRepo.markReplayed).toHaveBeenCalledWith('hosp-001', 'dlq_test_101');
    expect(mockAuditRepo.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DEAD_LETTER_REPLAYED',
        resourceId: 'dlq_test_101',
      }),
    );
  });

  test('bulk replays matching dead letters', async () => {
    const res = await dlqService.bulkReplay(
      'hosp-001',
      { failurePattern: 'timeout', limit: 10 },
      authContext,
    );

    expect(res.replayedCount).toBe(1);
    expect(res.replayedIds).toEqual(['dlq_test_101']);
    expect(mockAuditRepo.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DEAD_LETTER_BULK_REPLAYED' }),
    );
  });

  test('discards dead letter permanently', async () => {
    const res = await dlqService.discard('hosp-001', 'dlq_test_101', authContext);

    expect(res.success).toBe(true);
    expect(mockDlqRepo.delete).toHaveBeenCalledWith('hosp-001', 'dlq_test_101');
    expect(mockAuditRepo.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DEAD_LETTER_DISCARDED' }),
    );
  });
});
