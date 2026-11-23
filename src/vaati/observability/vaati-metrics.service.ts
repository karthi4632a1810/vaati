import { Injectable } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from '@prometheus-io/client';
import { VaatiConfigService } from '@waha/vaati/config/vaati.config';

@Injectable()
export class VaatiMetricsService {
  readonly registry: Registry;
  readonly contentType = 'text/plain; version=0.0.4; charset=utf-8';

  // Counters
  readonly messagesPublishedTotal: Counter<'tenant' | 'exchange' | 'status'>;
  readonly messagesRoutedTotal: Counter<'tenant' | 'exchange' | 'queue'>;
  readonly messagesConsumedTotal: Counter<'tenant' | 'queue' | 'status'>;

  // Histograms
  readonly processingDurationSeconds: Histogram<'tenant' | 'queue'>;

  // Gauges
  readonly queueDepth: Gauge<'tenant' | 'queue' | 'state'>;
  readonly deadLettersTotal: Gauge<'tenant' | 'queue'>;
  readonly activeWorkersTotal: Gauge<'tenant' | 'queue'>;

  constructor(private readonly config: VaatiConfigService) {
    this.registry = new Registry();
    this.registry.setDefaultLabels({ platform: 'vaati_2_0' });

    collectDefaultMetrics({ register: this.registry, prefix: 'vaati_' });

    this.messagesPublishedTotal = new Counter({
      name: 'vaati_messages_published_total',
      help: 'Total count of messages published through VAATI gateway',
      labelNames: ['tenant', 'exchange', 'status'],
      registers: [this.registry],
    });

    this.messagesRoutedTotal = new Counter({
      name: 'vaati_messages_routed_total',
      help: 'Total count of messages routed from exchanges to bound queues',
      labelNames: ['tenant', 'exchange', 'queue'],
      registers: [this.registry],
    });

    this.messagesConsumedTotal = new Counter({
      name: 'vaati_messages_consumed_total',
      help: 'Total count of messages processed by consumers (ack, retry, dead_letter)',
      labelNames: ['tenant', 'queue', 'status'],
      registers: [this.registry],
    });

    this.processingDurationSeconds = new Histogram({
      name: 'vaati_processing_duration_seconds',
      help: 'Histogram of consumer processing duration in seconds',
      labelNames: ['tenant', 'queue'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.queueDepth = new Gauge({
      name: 'vaati_queue_depth',
      help: 'Real-time job count in queues by state (waiting, active, delayed, failed)',
      labelNames: ['tenant', 'queue', 'state'],
      registers: [this.registry],
    });

    this.deadLettersTotal = new Gauge({
      name: 'vaati_dead_letters_total',
      help: 'Count of dead letter records in Dead Letter Office',
      labelNames: ['tenant', 'queue'],
      registers: [this.registry],
    });

    this.activeWorkersTotal = new Gauge({
      name: 'vaati_active_workers_total',
      help: 'Count of active worker consumers registered for queues',
      labelNames: ['tenant', 'queue'],
      registers: [this.registry],
    });
  }

  recordPublished(tenant: string, exchange: string, status: string): void {
    this.messagesPublishedTotal.inc({ tenant: tenant, exchange: exchange, status: status });
  }

  recordRouted(tenant: string, exchange: string, queue: string): void {
    this.messagesRoutedTotal.inc({ tenant: tenant, exchange: exchange, queue: queue });
  }

  recordConsumed(tenant: string, queue: string, status: 'ack' | 'retry' | 'dead_letter'): void {
    this.messagesConsumedTotal.inc({ tenant: tenant, queue: queue, status: status });
  }

  observeDuration(tenant: string, queue: string, durationSeconds: number): void {
    this.processingDurationSeconds.observe({ tenant: tenant, queue: queue }, durationSeconds);
  }

  setQueueDepth(tenant: string, queue: string, state: string, count: number): void {
    this.queueDepth.set({ tenant: tenant, queue: queue, state: state }, count);
  }

  async render(): Promise<string> {
    return await this.registry.metrics();
  }
}
