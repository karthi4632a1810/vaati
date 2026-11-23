import { VaatiConfigService } from '@waha/vaati/config/vaati.config';
import {
  VaatiAuthContext,
  VaatiExchangeType,
  VaatiRole,
} from '@waha/vaati/types/vaati.types';
import { VaatiWahaBridgeService } from '@waha/vaati/waha-bridge/vaati-waha-bridge.service';

describe('VaatiWahaBridgeService', () => {
  let bridgeService: VaatiWahaBridgeService;
  let mockConfig: VaatiConfigService;
  let mockExchangeRepo: any;
  let mockQueueRepo: any;
  let mockBindingRepo: any;
  let mockPublisherService: any;
  let mockWorkerCoordinator: any;
  let mockPluginsService: any;
  let mockSessionManager: any;
  let mockLogger: any;

  const authContext: VaatiAuthContext = {
    tenantId: 'default',
    actorId: 'test_admin',
    actorRole: VaatiRole.ADMIN,
    apiKeyId: 'key-1',
    allowedExchanges: ['*'],
    allowedQueues: ['*'],
  };

  beforeEach(() => {
    mockConfig = {
      isEnabled: true,
      defaultTenantId: 'default',
    } as any;

    mockExchangeRepo = {
      declare: jest.fn().mockResolvedValue({}),
    };
    mockQueueRepo = {
      declare: jest.fn().mockResolvedValue({}),
    };
    mockBindingRepo = {
      bind: jest.fn().mockResolvedValue({}),
    };

    mockPublisherService = {
      publish: jest.fn().mockResolvedValue({
        success: true,
        messageId: 'msg-waha-1',
        status: 'ROUTED',
        routedQueues: ['waha.outbound'],
      }),
    };

    mockWorkerCoordinator = {
      registerInternalHandler: jest.fn(),
      subscribe: jest.fn().mockResolvedValue({ id: 'sub-outbound' }),
    };

    mockPluginsService = {
      register: jest.fn(),
    };

    mockSessionManager = {
      isRunning: jest.fn().mockReturnValue(true),
      getSession: jest.fn(),
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    bridgeService = new VaatiWahaBridgeService(
      mockConfig,
      mockExchangeRepo,
      mockQueueRepo,
      mockBindingRepo,
      mockPublisherService,
      mockWorkerCoordinator,
      mockPluginsService,
      mockSessionManager,
      mockLogger,
    );
  });

  test('initializes broker topology and registers outbound worker on bootstrap', async () => {
    await bridgeService.onApplicationBootstrap();

    expect(mockExchangeRepo.declare).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'waha.events', type: VaatiExchangeType.TOPIC }),
    );
    expect(mockExchangeRepo.declare).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'waha.commands', type: VaatiExchangeType.TOPIC }),
    );
    expect(mockQueueRepo.declare).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'waha.outbound', priority: true }),
    );
    expect(mockBindingRepo.bind).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeName: 'waha.commands',
        queueName: 'waha.outbound',
        bindingKey: 'waha.send.#',
      }),
    );

    expect(mockWorkerCoordinator.registerInternalHandler).toHaveBeenCalledWith(
      'wahaOutboundHandler',
      expect.any(Function),
    );
    expect(mockPluginsService.register).toHaveBeenCalledWith(bridgeService);
  });

  test('forwards incoming WhatsApp event to waha.events exchange', async () => {
    const payload = { from: '919551382296@c.us', body: 'Hello Doctor' };
    const res = await bridgeService.publishInboundEvent('default', 'message', payload);

    expect(res.success).toBe(true);
    expect(mockPublisherService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        exchange: 'waha.events',
        routingKey: 'waha.event.default.message',
        payload: payload,
      }),
      expect.any(Object),
    );

    const metrics = bridgeService.getMetrics();
    expect(metrics.inboundEventsForwarded).toBe(1);
  });

  test('handles outbound text command using SessionManager', async () => {
    const mockSession = {
      sendText: jest.fn().mockResolvedValue({ id: 'wam_msg_001' }),
    };
    mockSessionManager.getSession.mockReturnValue(mockSession);

    const res = await bridgeService.handleOutboundMessage({
      session: 'default',
      chatId: '919551382296@c.us',
      text: 'Lab report ready',
      linkPreview: true,
    });

    expect(res.id).toBe('wam_msg_001');
    expect(mockSession.sendText).toHaveBeenCalledWith({
      chatId: '919551382296@c.us',
      text: 'Lab report ready',
      linkPreview: true,
    });

    const metrics = bridgeService.getMetrics();
    expect(metrics.outboundCommandsProcessed).toBe(1);
  });

  test('handles outbound poll command using SessionManager', async () => {
    const mockSession = {
      sendPoll: jest.fn().mockResolvedValue({ id: 'wam_poll_001' }),
    };
    mockSessionManager.getSession.mockReturnValue(mockSession);

    const pollConfig = { name: 'Confirm appointment?', options: ['Yes', 'No'] };
    const res = await bridgeService.handleOutboundMessage({
      session: 'default',
      chatId: '919551382296@c.us',
      poll: pollConfig,
    });

    expect(res.id).toBe('wam_poll_001');
    expect(mockSession.sendPoll).toHaveBeenCalledWith({
      chatId: '919551382296@c.us',
      poll: pollConfig,
    });
  });

  test('throws error if session is not running to trigger retry', async () => {
    mockSessionManager.isRunning.mockReturnValue(false);

    await expect(
      bridgeService.handleOutboundMessage({
        session: 'offline_session',
        chatId: '919551382296@c.us',
        text: 'Hello',
      }),
    ).rejects.toThrow("WhatsApp session 'offline_session' is not running; requeuing command");
  });

  test('dispatches outbound command via waha.commands exchange', async () => {
    const res = await bridgeService.dispatchOutboundCommand(
      {
        session: 'default',
        chatId: '919551382296@c.us',
        text: 'Appointment Reminder',
      },
      authContext,
    );

    expect(res.success).toBe(true);
    expect(mockPublisherService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        exchange: 'waha.commands',
        routingKey: 'waha.send.default.text',
        payload: expect.objectContaining({ chatId: '919551382296@c.us' }),
      }),
      authContext,
    );
  });
});
