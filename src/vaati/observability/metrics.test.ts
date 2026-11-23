import { VaatiConfigService } from '@waha/vaati/config/vaati.config';
import { VaatiMetricsService } from '@waha/vaati/observability/vaati-metrics.service';

describe('VaatiMetricsService', () => {
  let metricsService: VaatiMetricsService;
  let mockConfig: VaatiConfigService;

  beforeEach(() => {
    mockConfig = {} as any;
    metricsService = new VaatiMetricsService(mockConfig);
  });

  test('registers and renders Prometheus metrics with custom labels', async () => {
    metricsService.recordPublished('tenant-hosp', 'hospital.events', 'PERSISTED');
    metricsService.recordRouted('tenant-hosp', 'hospital.events', 'lis.orders.queue');
    metricsService.recordConsumed('tenant-hosp', 'lis.orders.queue', 'ack');
    metricsService.observeDuration('tenant-hosp', 'lis.orders.queue', 0.125);
    metricsService.setQueueDepth('tenant-hosp', 'lis.orders.queue', 'waiting', 42);

    const rendered = await metricsService.render();

    expect(rendered).toContain('vaati_messages_published_total');
    expect(rendered).toContain('vaati_messages_routed_total');
    expect(rendered).toContain('vaati_messages_consumed_total');
    expect(rendered).toContain('vaati_processing_duration_seconds');
    expect(rendered).toContain('vaati_queue_depth');
    expect(rendered).toContain('tenant="tenant-hosp"');
    expect(rendered).toContain('queue="lis.orders.queue"');
  });
});
