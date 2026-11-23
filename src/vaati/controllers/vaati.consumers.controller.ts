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
import { AuditLogRepository } from '@waha/vaati/repositories/audit-log.repository';
import { VaatiAuthContext, VaatiRole } from '@waha/vaati/types/vaati.types';
import { SubscribeConsumerDto } from '@waha/vaati/workers/dto/consumer.dto';
import { VaatiWorkerCoordinator } from '@waha/vaati/workers/vaati-worker-coordinator.service';

@ApiTags('VAATI Consumer Subscriptions')
@ApiBearerAuth()
@ApiHeader({ name: 'x-vaati-api-key', required: false, description: 'VAATI API Key' })
@Controller('api/v1/consumers')
@UseGuards(VaatiApiKeyGuard, VaatiRbacGuard)
export class VaatiConsumersController {
  constructor(
    private readonly coordinator: VaatiWorkerCoordinator,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  @Post('subscribe')
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR, VaatiRole.CONSUMER)
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({ summary: 'Subscribe a consumer / webhook to a queue' })
  async subscribe(
    @Body() dto: SubscribeConsumerDto,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
  ) {
    const sub = await this.coordinator.subscribe(auth.tenantId, dto.queueName, {
      targetWebhookUrl: dto.targetWebhookUrl,
      internalHandlerName: dto.internalHandlerName,
      concurrency: dto.concurrency,
    });

    await this.auditRepo.log({
      tenantId: auth.tenantId,
      actorId: auth.actorId,
      actorRole: auth.actorRole,
      action: 'CONSUMER_SUBSCRIBED',
      resourceType: 'SUBSCRIPTION',
      resourceId: sub.id,
      details: { queueName: dto.queueName, webhook: dto.targetWebhookUrl },
    });

    return sub;
  }

  @Get()
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR, VaatiRole.CONSUMER)
  @ApiOperation({ summary: 'List active consumer subscriptions for the tenant' })
  async listSubscriptions(@CurrentVaatiAuth() auth: VaatiAuthContext) {
    return this.coordinator.getSubscriptions(auth.tenantId);
  }

  @Delete(':id')
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR)
  @ApiOperation({ summary: 'Unsubscribe consumer and close idle workers' })
  async unsubscribe(
    @Param('id') id: string,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
  ) {
    const success = await this.coordinator.unsubscribe(id);
    if (!success) {
      throw new NotFoundException(`Subscription ${id} not found`);
    }

    await this.auditRepo.log({
      tenantId: auth.tenantId,
      actorId: auth.actorId,
      actorRole: auth.actorRole,
      action: 'CONSUMER_UNSUBSCRIBED',
      resourceType: 'SUBSCRIPTION',
      resourceId: id,
    });

    return { success: true, message: `Subscription ${id} removed` };
  }
}
