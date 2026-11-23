import { matchTopic } from '@waha/vaati/broker/routing/topic-matcher';
import { ExchangeRouterService } from '@waha/vaati/broker/routing/exchange-router';
import { VaatiBinding, VaatiExchange, VaatiExchangeType } from '@waha/vaati/types/vaati.types';

describe('AMQP 0-9-1 Topic Matcher Engine', () => {
  test('matches exact words', () => {
    expect(matchTopic('hospital.lis.report', 'hospital.lis.report')).toBe(true);
    expect(matchTopic('hospital.lis.report', 'hospital.pacs.report')).toBe(false);
  });

  test('matches single word wildcard *', () => {
    expect(matchTopic('hospital.*.report', 'hospital.lis.report')).toBe(true);
    expect(matchTopic('hospital.*.report', 'hospital.pacs.report')).toBe(true);
    expect(matchTopic('hospital.*.report', 'hospital.report')).toBe(false);
    expect(matchTopic('hospital.*.report', 'hospital.lis.urgent.report')).toBe(false);
  });

  test('matches multi-word wildcard # at the end', () => {
    expect(matchTopic('hospital.#', 'hospital')).toBe(true);
    expect(matchTopic('hospital.#', 'hospital.lis')).toBe(true);
    expect(matchTopic('hospital.#', 'hospital.lis.urgent.report')).toBe(true);
    expect(matchTopic('hospital.#', 'clinic.lis')).toBe(false);
  });

  test('matches multi-word wildcard # at the beginning', () => {
    expect(matchTopic('#.report', 'report')).toBe(true);
    expect(matchTopic('#.report', 'lis.report')).toBe(true);
    expect(matchTopic('#.report', 'hospital.lis.urgent.report')).toBe(true);
    expect(matchTopic('#.report', 'report.ready')).toBe(false);
  });

  test('matches multi-word wildcard # in the middle', () => {
    expect(matchTopic('a.#.z', 'a.z')).toBe(true);
    expect(matchTopic('a.#.z', 'a.b.z')).toBe(true);
    expect(matchTopic('a.#.z', 'a.b.c.d.z')).toBe(true);
    expect(matchTopic('a.#.z', 'a.b.c.d.e')).toBe(false);
  });

  test('matches complex combinations like a.*.b.#.c', () => {
    const pattern = 'a.*.b.#.c';
    expect(matchTopic(pattern, 'a.1.b.c')).toBe(true);
    expect(matchTopic(pattern, 'a.x.b.y.z.c')).toBe(true);
    expect(matchTopic(pattern, 'a.b.c')).toBe(false); // missing * word
    expect(matchTopic(pattern, 'a.1.b.y.z.d')).toBe(false); // ending not c
  });

  test('# alone matches any routing key', () => {
    expect(matchTopic('#', 'any.arbitrary.key.123')).toBe(true);
    expect(matchTopic('#', 'single')).toBe(true);
  });
});

describe('ExchangeRouterService', () => {
  let router: ExchangeRouterService;
  let mockExchangeRepo: any;
  let mockBindingRepo: any;

  beforeEach(() => {
    mockExchangeRepo = {
      findByName: jest.fn(),
    };
    mockBindingRepo = {
      findByExchange: jest.fn(),
    };
    router = new ExchangeRouterService(mockExchangeRepo, mockBindingRepo);
  });

  test('routes DIRECT exchange only to exact binding key match', async () => {
    mockExchangeRepo.findByName.mockResolvedValueOnce({
      type: VaatiExchangeType.DIRECT,
    });
    mockBindingRepo.findByExchange.mockResolvedValueOnce([
      { queueName: 'orders.queue', bindingKey: 'order.created' },
      { queueName: 'invoices.queue', bindingKey: 'invoice.created' },
    ]);

    const result = await router.routeMessage('tenant-1', 'direct.ex', 'order.created');
    expect(result).toEqual(['orders.queue']);
  });

  test('routes FANOUT exchange to all bound queues ignoring routing key', async () => {
    mockExchangeRepo.findByName.mockResolvedValueOnce({
      type: VaatiExchangeType.FANOUT,
    });
    mockBindingRepo.findByExchange.mockResolvedValueOnce([
      { queueName: 'audit.queue', bindingKey: '' },
      { queueName: 'analytics.queue', bindingKey: '' },
      { queueName: 'backup.queue', bindingKey: 'ignored.key' },
    ]);

    const result = await router.routeMessage('tenant-1', 'fanout.ex', 'any.routing.key');
    expect(result).toEqual(['audit.queue', 'analytics.queue', 'backup.queue']);
  });

  test('routes HEADERS exchange with x-match: all', async () => {
    mockExchangeRepo.findByName.mockResolvedValueOnce({
      type: VaatiExchangeType.HEADERS,
    });
    mockBindingRepo.findByExchange.mockResolvedValueOnce([
      {
        queueName: 'critical.pacs.queue',
        headerRules: { 'x-match': 'all', format: 'DICOM', priority: 'URGENT' },
      },
      {
        queueName: 'standard.pacs.queue',
        headerRules: { 'x-match': 'all', format: 'DICOM', priority: 'NORMAL' },
      },
    ]);

    const result = await router.routeMessage('tenant-1', 'headers.ex', '', {
      format: 'DICOM',
      priority: 'URGENT',
    });
    expect(result).toEqual(['critical.pacs.queue']);
  });

  test('routes HEADERS exchange with x-match: any', async () => {
    mockExchangeRepo.findByName.mockResolvedValue({
      type: VaatiExchangeType.HEADERS,
    });
    mockBindingRepo.findByExchange.mockResolvedValue([
      {
        queueName: 'notifications.queue',
        headerRules: { 'x-match': 'any', channel: 'SMS', urgent: 'true' },
      },
    ]);

    const matchBySms = await router.routeMessage('tenant-1', 'headers.ex', '', { channel: 'SMS' });
    expect(matchBySms).toEqual(['notifications.queue']);

    const matchByUrgent = await router.routeMessage('tenant-1', 'headers.ex', '', { urgent: 'true' });
    expect(matchByUrgent).toEqual(['notifications.queue']);

    const noMatch = await router.routeMessage('tenant-1', 'headers.ex', '', { channel: 'EMAIL' });
    expect(noMatch).toEqual([]);
  });
});
