import { VaatiConfigService } from '@waha/vaati/config/vaati.config';
import {
  VaatiMessageStatus,
  VaatiQueue,
  VaatiQueueState,
} from '@waha/vaati/types/vaati.types';
import { VaatiWorkerCoordinator } from '@waha/vaati/workers/vaati-worker-coordinator.service';

describe('VaatiWorkerCoordinator', () => {
  let coordinator: VaatiWorkerCoordinator;
  let mockConfig: VaatiConfigService;
  let mockQueueRepo: any;
  let mockMessageRepo: any;
  let mockDlqRepo: any;
  let mockCircuitBreaker: any;
  let mockLogger: any;

  const testQueue: VaatiQueue = {
    id: 'q-1',
    tenantId: 'hosp-001',
    name: 'lab.processing.queue',
    durable: true,
    priority: false,
    maxAttempts: 3,
    messageTtlMs: 86400000,
    deadLetterExchange: 'dlx.events',
    deadLetterRoutingKey: 'dead.letter',
    state: VaatiQueueState.ACTIVE,
    concurrencyLimit: 25,
    createdAt: new Date(),
  };

  beforeEach(() => {
    mockConfig = {
      redisUrl: 'redis://localhost:6379',
      masterApiKey: 'secret_key',
    } as any;

    mockQueueRepo = {
      findByName: jest.fn().mockResolvedValue(testQueue),
    };

    mockMessageRepo = {
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };

    mockDlqRepo = {
      create: jest.fn().mockResolvedValue({ id: 'dlq-1' }),
    };

    mockCircuitBreaker = {
      canExecute: jest.fn().mockReturnValue(true),
      recordSuccess: jest.fn(),
      recordFailure: jest.fn(),
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    coordinator = new VaatiWorkerCoordinator(
      mockConfig,
      mockQueueRepo,
      mockMessageRepo,
      mockDlqRepo,
      mockCircuitBreaker,
      mockLogger,
    );
  });

  afterEach(async () => {
    await coordinator.onModuleDestroy();
  });

  test('subscribes consumer and registers internal handler', async () => {
    const handler = jest.fn().mockResolvedValue({ processed: true });
    coordinator.registerInternalHandler('labHandler', handler);

    const sub = await coordinator.subscribe('hosp-001', 'lab.processing.queue', {
      internalHandlerName: 'labHandler',
      concurrency: 10,
    });

    expect(sub.id).toBeDefined();
    expect(sub.queueName).toBe('lab.processing.queue');
    expect(sub.internalHandlerName).toBe('labHandler');
    expect(sub.concurrency).toBe(10);

    const allSubs = coordinator.getSubscriptions('hosp-001');
    expect(allSubs.length).toBe(1);
    expect(allSubs[0].id).toBe(sub.id);
  });

  test('processes job successfully and transitions status to ACKNOWLEDGED', async () => {
    const handler = jest.fn().mockResolvedValue({ ok: true });
    coordinator.registerInternalHandler('successHandler', handler);

    await coordinator.subscribe('hosp-001', 'lab.processing.queue', {
      internalHandlerName: 'successHandler',
    });

    const mockJob: any = {
      id: 'job-123',
      attemptsMade: 0,
      data: {
        messageId: 'msg-999',
        exchange: 'hospital.events',
        routingKey: 'lab.order.created',
        payload: { sample: 'BLOOD' },
      },
    };

    // Invoke private processJob via any
    const result = await (coordinator as any).processJob(
      'hosp-001',
      'lab.processing.queue',
      testQueue,
      mockJob,
    );

    expect(result.success).toBe(true);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 'msg-999',
        routingKey: 'lab.order.created',
        payload: { sample: 'BLOOD' },
      }),
    );

    expect(mockMessageRepo.updateStatus).toHaveBeenCalledWith(
      'hosp-001',
      'msg-999',
      VaatiMessageStatus.PROCESSING,
      { incrementAttempts: true },
    );

    expect(mockMessageRepo.updateStatus).toHaveBeenCalledWith(
      'hosp-001',
      'msg-999',
      VaatiMessageStatus.ACKNOWLEDGED,
    );
  });

  test('schedules retry when job fails before max attempts', async () => {
    const failingHandler = jest.fn().mockRejectedValue(new Error('LIS connection timeout'));
    coordinator.registerInternalHandler('failHandler', failingHandler);

    await coordinator.subscribe('hosp-001', 'lab.processing.queue', {
      internalHandlerName: 'failHandler',
    });

    const mockJob: any = {
      id: 'job-123',
      attemptsMade: 0, // First attempt, maxAttempts is 3
      data: { messageId: 'msg-999', payload: {} },
    };

    await expect(
      (coordinator as any).processJob('hosp-001', 'lab.processing.queue', testQueue, mockJob),
    ).rejects.toThrow('LIS connection timeout');

    expect(mockMessageRepo.updateStatus).toHaveBeenCalledWith(
      'hosp-001',
      'msg-999',
      VaatiMessageStatus.RETRY_SCHEDULED,
      expect.objectContaining({ errorSummary: 'LIS connection timeout' }),
    );
    expect(mockDlqRepo.create).not.toHaveBeenCalled();
  });

  test('moves to DEAD_LETTERED and records in DLQ on terminal failure', async () => {
    const failingHandler = jest.fn().mockRejectedValue(new Error('Fatal schema corruption'));
    coordinator.registerInternalHandler('fatalHandler', failingHandler);

    await coordinator.subscribe('hosp-001', 'lab.processing.queue', {
      internalHandlerName: 'fatalHandler',
    });

    const mockJob: any = {
      id: 'job-123',
      attemptsMade: 2, // 3rd attempt, equals maxAttempts (3) -> terminal!
      data: {
        messageId: 'msg-999',
        exchange: 'hospital.events',
        routingKey: 'lab.fatal',
        payload: { bad: 'data' },
      },
    };

    await expect(
      (coordinator as any).processJob('hosp-001', 'lab.processing.queue', testQueue, mockJob),
    ).rejects.toThrow('Fatal schema corruption');

    expect(mockMessageRepo.updateStatus).toHaveBeenCalledWith(
      'hosp-001',
      'msg-999',
      VaatiMessageStatus.DEAD_LETTERED,
      expect.objectContaining({ errorSummary: 'Fatal schema corruption' }),
    );

    expect(mockDlqRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'hosp-001',
        messageId: 'msg-999',
        originalQueue: 'lab.processing.queue',
        failureReason: 'Fatal schema corruption',
        redeliveryCount: 3,
      }),
    );
  });
});
