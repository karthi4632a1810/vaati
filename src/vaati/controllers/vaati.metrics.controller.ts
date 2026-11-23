import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicVaatiRoute } from '@waha/vaati/auth/decorators';
import { VaatiMetricsService } from '@waha/vaati/observability/vaati-metrics.service';
import { Response } from 'express';

@ApiTags('VAATI Observability & Telemetry')
@Controller('api/v1/metrics')
export class VaatiMetricsController {
  constructor(private readonly metrics: VaatiMetricsService) {}

  @Get()
  @PublicVaatiRoute()
  @ApiOperation({
    summary: 'Export Prometheus metrics for VAATI broker queues, throughput, latency, and DLQs',
  })
  async getMetrics(@Res() res: Response): Promise<void> {
    const body = await this.metrics.render();
    res.set('Content-Type', this.metrics.contentType);
    res.send(body);
  }
}
