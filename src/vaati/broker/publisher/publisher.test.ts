import { UnprocessableEntityException } from '@nestjs/common';
import { VaatiPublisherService } from '@waha/vaati/broker/publisher/vaati-publisher.service';
import {
  VaatiAuthContext,
  VaatiMessageStatus,
  VaatiRole,
  VaatiTenantStatus,
} from '@waha/vaati/types/vaati.types';

describe('VaatiPublisherService', () => {
  let publisher: VaatiPublisherService;
  let mockMessageRepo: any;
  let mockTenantRepo: any;
  let mockRouterService: any;
  let mockQueueService: any;
  let mockRateLimitService: any;
  let mockMetricsService: any;
  let mockLogger: any;

  const authContext: VaatiAuthContext = {
    tenantId: 'tenant-100',
    actorId: 'usr-1',
    actorRole: VaatiRole.PUBLISHER,
    apiKeyId: 'key-1',
    allowedExchanges: ['*'],
    allowedQueues: ['*'],
  };

  beforeEach(() => {
    mockMessageRepo = {
      findByIdempotencyKey: jest.fn(),
      create: jest.fn(),
      updateStatus: jest.fn(),
    };
    mockTenantRepo = {
      findById: jest.fn().mockResolvedValue({
        id: 'tenant-100',
        status: VaatiTenantStatus.ACTIVE,
        rateLimitPerMinute: 6000,
      }),
    };
    mockRouterService = {
      routeMessage: jest.fn(),
    };
    mockQueueService = {
      enqueueMessage: jest.fn().mockResolvedValue({ enqueued: true, jobId: 'msg-1' }),
    };
    mockRateLimitService = {
      checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
    };
    mockMetricsService = {
      recordPublished: jest.fn(),
      recordRouted: jest.fn(),
    };
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    publisher = new VaatiPublisherService(
      mockMessageRepo,
      mockTenantRepo,
      mockRouterService,
      mockQueueService,
      mockRateLimitService,
      mockMetricsService,
      mockLogger,
    );
  });

  test('successfully publishes message, persists outbox, and routes to bound queues', async () => {
    mockRouterService.routeMessage.mockResolvedValueOnce(['lis.orders.queue', 'audit.stream']);

    const res = await publisher.publish(
      {
        exchange: 'hospital.events',
        routingKey: 'lab.order.ready',
        payload: { orderId: 'ORD-999', patient: 'P-123' },
        options: { priority: 7, maxAttempts: 3 },
      },
      authContext,
    );

    expect(res.success).toBe(true);
    expect(res.status).toBe(VaatiMessageStatus.ROUTED);
    expect(res.routedQueues).toEqual(['lis.orders.queue', 'audit.stream']);

    expect(mockMessageRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeName: 'hospital.events',
        routingKey: 'lab.order.ready',
        priority: 7,
        status: VaatiMessageStatus.PERSISTED,
      }),
    );

    expect(mockQueueService.enqueueMessage).toHaveBeenCalledTimes(2);
    expect(mockMetricsService.recordPublished).toHaveBeenCalledWith('tenant-100', 'hospital.events', 'PERSISTED');
    expect(mockMetricsService.recordRouted).toHaveBeenCalledTimes(2);
    expect(mockMessageRepo.updateStatus).toHaveBeenCalledWith(
      'tenant-100',
      res.messageId,
      VaatiMessageStatus.ROUTED,
    );
  });

  test('detects idempotency key and returns existing record without duplicate enqueue', async () => {
    mockMessageRepo.findByIdempotencyKey.mockResolvedValueOnce({
      id: 'existing-msg-id',
      status: VaatiMessageStatus.ROUTED,
      createdAt: new Date('2026-11-23T10:00:00.000Z'),
    });

    const res = await publisher.publish(
      {
        exchange: 'hospital.events',
        routingKey: 'lab.order.ready',
        idempotencyKey: 'idemp-lab-ord-999',
        payload: { orderId: 'ORD-999' },
      },
      authContext,
    );

    expect(res.duplicate).toBe(true);
    expect(res.messageId).toBe('existing-msg-id');
    expect(mockMessageRepo.create).not.toHaveBeenCalled();
    expect(mockQueueService.enqueueMessage).not.toHaveBeenCalled();
  });

  test('throws UnprocessableEntityException when mandatory message cannot be routed', async () => {
    mockRouterService.routeMessage.mockResolvedValueOnce([]); // no matching queues

    await expect(
      publisher.publish(
        {
          exchange: 'hospital.events',
          routingKey: 'unroutable.orphan.key',
          payload: { test: true },
          options: { mandatory: true },
        },
        authContext,
      ),
    ).rejects.toThrow(UnprocessableEntityException);

    expect(mockMessageRepo.updateStatus).toHaveBeenCalledWith(
      'tenant-100',
      expect.any(String),
      VaatiMessageStatus.FAILED,
      expect.objectContaining({ errorSummary: expect.stringContaining('Mandatory') }),
    );
  });
});
