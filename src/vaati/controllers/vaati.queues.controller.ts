import * as crypto from 'node:crypto';

import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WAHAValidationPipe } from '@waha/nestjs/pipes/WAHAValidationPipe';
import { CurrentVaatiAuth, VaatiRoles } from '@waha/vaati/auth/decorators';
import { VaatiApiKeyGuard } from '@waha/vaati/auth/vaati-api-key.guard';
import { VaatiRbacGuard } from '@waha/vaati/auth/vaati-rbac.guard';
import { VaatiQueueService } from '@waha/vaati/broker/queues/vaati-queue.service';
import { DeclareQueueDto } from '@waha/vaati/dto/queue.dto';
import { AuditLogRepository } from '@waha/vaati/repositories/audit-log.repository';
import { QueueRepository } from '@waha/vaati/repositories/queue.repository';
import { VaatiAuthContext, VaatiRole } from '@waha/vaati/types/vaati.types';

@ApiTags('VAATI Queue Management')
@ApiBearerAuth()
@ApiHeader({ name: 'x-vaati-api-key', required: false, description: 'VAATI API Key' })
@Controller('api/v1/queues')
@UseGuards(VaatiApiKeyGuard, VaatiRbacGuard)
export class VaatiQueuesController {
  constructor(
    private readonly queueRepo: QueueRepository,
    private readonly queueService: VaatiQueueService,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  @Post()
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR)
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({ summary: 'Declare a durable or priority queue' })
  async declareQueue(
    @Body() dto: DeclareQueueDto,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
  ) {
    const queue = await this.queueRepo.declare({
      id: `q_${crypto.randomUUID()}`,
      tenantId: auth.tenantId,
      name: dto.name,
      durable: dto.durable,
      priority: dto.priority,
      maxAttempts: dto.maxAttempts,
      messageTtlMs: dto.messageTtlMs,
      deadLetterExchange: dto.deadLetterExchange,
      deadLetterRoutingKey: dto.deadLetterRoutingKey,
      concurrencyLimit: dto.concurrencyLimit,
    });

    await this.auditRepo.log({
      tenantId: auth.tenantId,
      actorId: auth.actorId,
      actorRole: auth.actorRole,
      action: 'QUEUE_DECLARED',
      resourceType: 'QUEUE',
      resourceId: queue.name,
      details: { priority: queue.priority, maxAttempts: queue.maxAttempts },
    });

    return queue;
  }

  @Get()
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR, VaatiRole.PUBLISHER, VaatiRole.CONSUMER)
  @ApiOperation({ summary: 'List all queues with real-time job counts' })
  async listQueues(@CurrentVaatiAuth() auth: VaatiAuthContext) {
    const queues = await this.queueRepo.findByTenant(auth.tenantId);
    const enriched = await Promise.all(
      queues.map(async (q) => {
        const metrics = await this.queueService.getQueueMetrics(auth.tenantId, q.name);
        return {
          ...q,
          metrics: metrics,
        };
      }),
    );
    return enriched;
  }

  @Get(':name')
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR, VaatiRole.PUBLISHER, VaatiRole.CONSUMER)
  @ApiOperation({ summary: 'Get queue status and depths' })
  async getQueue(
    @Param('name') name: string,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
  ) {
    const queue = await this.queueRepo.findByName(auth.tenantId, name);
    if (!queue) {
      throw new NotFoundException(`Queue ${name} not found`);
    }
    const metrics = await this.queueService.getQueueMetrics(auth.tenantId, name);
    return {
      ...queue,
      metrics: metrics,
    };
  }

  @Post(':name/pause')
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR)
  @ApiOperation({ summary: 'Pause a queue from dispatching to consumers' })
  async pauseQueue(
    @Param('name') name: string,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
  ) {
    await this.queueService.pauseQueue(auth.tenantId, name);
    await this.auditRepo.log({
      tenantId: auth.tenantId,
      actorId: auth.actorId,
      actorRole: auth.actorRole,
      action: 'QUEUE_PAUSED',
      resourceType: 'QUEUE',
      resourceId: name,
    });
    return { success: true, message: `Queue ${name} paused` };
  }

  @Post(':name/resume')
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR)
  @ApiOperation({ summary: 'Resume message processing on a queue' })
  async resumeQueue(
    @Param('name') name: string,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
  ) {
    await this.queueService.resumeQueue(auth.tenantId, name);
    await this.auditRepo.log({
      tenantId: auth.tenantId,
      actorId: auth.actorId,
      actorRole: auth.actorRole,
      action: 'QUEUE_RESUMED',
      resourceType: 'QUEUE',
      resourceId: name,
    });
    return { success: true, message: `Queue ${name} resumed` };
  }

  @Post(':name/purge')
  @VaatiRoles(VaatiRole.ADMIN)
  @ApiOperation({ summary: 'Purge all waiting jobs from queue' })
  async purgeQueue(
    @Param('name') name: string,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
  ) {
    const res = await this.queueService.purgeQueue(auth.tenantId, name);
    await this.auditRepo.log({
      tenantId: auth.tenantId,
      actorId: auth.actorId,
      actorRole: auth.actorRole,
      action: 'QUEUE_PURGED',
      resourceType: 'QUEUE',
      resourceId: name,
    });
    return { success: res.purged, message: `Queue ${name} purged` };
  }

  @Delete(':name')
  @VaatiRoles(VaatiRole.ADMIN)
  @ApiOperation({ summary: 'Permanently delete queue and obliterate BullMQ storage' })
  async deleteQueue(
    @Param('name') name: string,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
  ) {
    await this.queueService.deleteQueue(auth.tenantId, name);
    await this.auditRepo.log({
      tenantId: auth.tenantId,
      actorId: auth.actorId,
      actorRole: auth.actorRole,
      action: 'QUEUE_DELETED',
      resourceType: 'QUEUE',
      resourceId: name,
    });
    return { success: true, message: `Queue ${name} deleted` };
  }
}
