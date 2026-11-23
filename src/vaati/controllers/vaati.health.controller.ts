import {
  Controller,
  Get,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicVaatiRoute } from '@waha/vaati/auth/decorators';
import { VaatiConfigService } from '@waha/vaati/config/vaati.config';
import { VaatiDatabaseService } from '@waha/vaati/database/vaati.database';

@ApiTags('VAATI Health & Diagnostics')
@Controller('api/v1/health')
export class VaatiHealthController {
  constructor(
    private readonly config: VaatiConfigService,
    private readonly db: VaatiDatabaseService,
  ) {}

  @Get()
  @PublicVaatiRoute()
  @ApiOperation({ summary: 'Check VAATI broker engine health and subsystem statuses' })
  async getHealth() {
    let dbStatus = 'UP';
    let dbError: string | null = null;
    try {
      await this.db.knex.raw('SELECT 1');
    } catch (err: any) {
      dbStatus = 'DOWN';
      dbError = err.message;
    }

    const memoryUsage = process.memoryUsage();

    return {
      status: dbStatus === 'UP' ? 'ok' : 'degraded',
      platform: 'VAATI 2.0 Distributed Messaging & Orchestration',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        status: dbStatus,
        type: this.config.databaseType,
        error: dbError,
      },
      memory: {
        rssBytes: memoryUsage.rss,
        heapUsedBytes: memoryUsage.heapUsed,
        heapTotalBytes: memoryUsage.heapTotal,
      },
    };
  }

  @Get('liveness')
  @PublicVaatiRoute()
  @ApiOperation({ summary: 'Kubernetes/Docker container liveness probe' })
  async getLiveness() {
    return {
      status: 'UP',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('readiness')
  @PublicVaatiRoute()
  @ApiOperation({ summary: 'Kubernetes/Docker container readiness probe' })
  async getReadiness() {
    try {
      await this.db.knex.raw('SELECT 1');
      return {
        status: 'UP',
        database: 'UP',
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      throw new ServiceUnavailableException({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        status: 'DOWN',
        database: 'DOWN',
        error: err.message,
      });
    }
  }
}
