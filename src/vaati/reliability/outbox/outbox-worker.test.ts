import { VaatiConfigService } from '@waha/vaati/config/vaati.config';
import { VaatiOutboxWorkerService } from '@waha/vaati/reliability/outbox/vaati-outbox-worker.service';
import { VaatiMessageStatus } from '@waha/vaati/types/vaati.types';

describe('VaatiOutboxWorkerService', () => {
  let outboxWorker: VaatiOutboxWorkerService;
  let mockConfig: VaatiConfigService;
  let mockMessageRepo: any;
  let mockRouterService: any;
  let mockQueueService: any;
  let mockLogger: any;

  beforeEach(() => {
    mockConfig = {
      isEnabled: true,
    } as any;

    mockMessageRepo = {
      findPendingOutbox: jest.fn(),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };

    mockRouterService = {
      routeMessage: jest.fn(),
    };

    mockQueueService = {
      enqueueMessage: jest.fn().mockResolvedValue({ enqueued: true, jobId: 'job-outbox-1' }),
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    outboxWorker = new VaatiOutboxWorkerService(
      mockConfig,
      mockMessageRepo,
      mockRouterService,
      mockQueueService,
      mockLogger,
    );
  });

  afterEach(() => {
    outboxWorker.onModuleDestroy();
  });

  test('polls pending persisted messages and dispatches them to queues', async () => {
    mockMessageRepo.findPendingOutbox.mockResolvedValueOnce([
      {
        id: 'msg-outbox-101',
        tenantId: 'tenant-apollo',
        exchangeName: 'hospital.events',
        routingKey: 'lab.ready',
        headers: { source: 'outbox_test' },
        payload: { sampleId: 'SMPL_1' },
        priority: 5,
        maxAttempts: 4,
        ttlMs: 3600000,
        status: VaatiMessageStatus.PERSISTED,
      },
    ]);

    mockRouterService.routeMessage.mockResolvedValueOnce(['lis.orders.queue']);

    const dispatched = await outboxWorker.pollAndDispatch(50);

    expect(dispatched).toBe(1);
    expect(mockQueueService.enqueueMessage).toHaveBeenCalledWith(
      'tenant-apollo',
      'lis.orders.queue',
      'msg-outbox-101',
      expect.objectContaining({ messageId: 'msg-outbox-101' }),
      expect.objectContaining({ priority: 5 }),
    );

    expect(mockMessageRepo.updateStatus).toHaveBeenCalledWith(
      'tenant-apollo',
      'msg-outbox-101',
      VaatiMessageStatus.ROUTED,
    );
  });

  test('handles empty outbox batch without errors', async () => {
    mockMessageRepo.findPendingOutbox.mockResolvedValueOnce([]);

    const dispatched = await outboxWorker.pollAndDispatch(50);
    expect(dispatched).toBe(0);
    expect(mockRouterService.routeMessage).not.toHaveBeenCalled();
  });
});
