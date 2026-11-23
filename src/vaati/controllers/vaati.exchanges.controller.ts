import * as crypto from 'node:crypto';

import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { WAHAValidationPipe } from '@waha/nestjs/pipes/WAHAValidationPipe';
import { CurrentVaatiAuth, VaatiRoles } from '@waha/vaati/auth/decorators';
import { VaatiApiKeyGuard } from '@waha/vaati/auth/vaati-api-key.guard';
import { VaatiRbacGuard } from '@waha/vaati/auth/vaati-rbac.guard';
import { BindQueueDto, DeclareExchangeDto } from '@waha/vaati/dto/exchange.dto';
import { AuditLogRepository } from '@waha/vaati/repositories/audit-log.repository';
import { BindingRepository } from '@waha/vaati/repositories/binding.repository';
import { ExchangeRepository } from '@waha/vaati/repositories/exchange.repository';
import { QueueRepository } from '@waha/vaati/repositories/queue.repository';
import { VaatiAuthContext, VaatiRole } from '@waha/vaati/types/vaati.types';

@ApiTags('VAATI Exchange Management')
@ApiBearerAuth()
@ApiHeader({ name: 'x-vaati-api-key', required: false, description: 'VAATI API Key' })
@Controller('api/v1/exchanges')
@UseGuards(VaatiApiKeyGuard, VaatiRbacGuard)
export class VaatiExchangesController {
  constructor(
    private readonly exchangeRepo: ExchangeRepository,
    private readonly queueRepo: QueueRepository,
    private readonly bindingRepo: BindingRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  @Post()
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR)
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({ summary: 'Declare a message exchange (DIRECT, TOPIC, FANOUT, HEADERS)' })
  async declareExchange(
    @Body() dto: DeclareExchangeDto,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
  ) {
    const exchange = await this.exchangeRepo.declare({
      id: `ex_${crypto.randomUUID()}`,
      tenantId: auth.tenantId,
      name: dto.name,
      type: dto.type,
      durable: dto.durable,
      autoDelete: dto.autoDelete,
    });

    await this.auditRepo.log({
      tenantId: auth.tenantId,
      actorId: auth.actorId,
      actorRole: auth.actorRole,
      action: 'EXCHANGE_DECLARED',
      resourceType: 'EXCHANGE',
      resourceId: exchange.name,
      details: { type: exchange.type },
    });

    return exchange;
  }

  @Get()
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR, VaatiRole.PUBLISHER, VaatiRole.CONSUMER)
  @ApiOperation({ summary: 'List all exchanges for active tenant' })
  async listExchanges(@CurrentVaatiAuth() auth: VaatiAuthContext) {
    return await this.exchangeRepo.findByTenant(auth.tenantId);
  }

  @Get(':name')
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR, VaatiRole.PUBLISHER, VaatiRole.CONSUMER)
  @ApiOperation({ summary: 'Get details and bindings for an exchange' })
  async getExchange(
    @Param('name') name: string,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
  ) {
    const exchange = await this.exchangeRepo.findByName(auth.tenantId, name);
    if (!exchange) {
      throw new NotFoundException(`Exchange ${name} not found`);
    }
    const bindings = await this.bindingRepo.findByExchange(auth.tenantId, name);
    return {
      ...exchange,
      bindings: bindings,
    };
  }

  @Delete(':name')
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR)
  @ApiOperation({ summary: 'Delete an exchange and its bindings' })
  async deleteExchange(
    @Param('name') name: string,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
  ) {
    const deleted = await this.exchangeRepo.delete(auth.tenantId, name);
    if (!deleted) {
      throw new NotFoundException(`Exchange ${name} not found`);
    }

    await this.auditRepo.log({
      tenantId: auth.tenantId,
      actorId: auth.actorId,
      actorRole: auth.actorRole,
      action: 'EXCHANGE_DELETED',
      resourceType: 'EXCHANGE',
      resourceId: name,
    });

    return { success: true, message: `Exchange ${name} deleted` };
  }

  @Post(':name/bindings')
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR)
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({ summary: 'Bind a queue to this exchange with a routing key / pattern' })
  async bindQueue(
    @Param('name') name: string,
    @Body() dto: BindQueueDto,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
  ) {
    const exchange = await this.exchangeRepo.findByName(auth.tenantId, name);
    if (!exchange) {
      throw new NotFoundException(`Exchange ${name} not found`);
    }

    const queue = await this.queueRepo.findByName(auth.tenantId, dto.queueName);
    if (!queue) {
      throw new NotFoundException(`Queue ${dto.queueName} not found`);
    }

    const binding = await this.bindingRepo.bind({
      id: `bind_${crypto.randomUUID()}`,
      tenantId: auth.tenantId,
      exchangeName: name,
      queueName: dto.queueName,
      bindingKey: dto.bindingKey ?? '',
      headerRules: dto.headerRules,
    });

    await this.auditRepo.log({
      tenantId: auth.tenantId,
      actorId: auth.actorId,
      actorRole: auth.actorRole,
      action: 'QUEUE_BOUND',
      resourceType: 'BINDING',
      resourceId: `${name}->${dto.queueName}`,
      details: { bindingKey: binding.bindingKey },
    });

    return binding;
  }

  @Get(':name/bindings')
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR, VaatiRole.PUBLISHER, VaatiRole.CONSUMER)
  @ApiOperation({ summary: 'List all queue bindings for an exchange' })
  async getBindings(
    @Param('name') name: string,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
  ) {
    return await this.bindingRepo.findByExchange(auth.tenantId, name);
  }

  @Delete(':name/bindings/:queue')
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR)
  @ApiQuery({ name: 'bindingKey', required: false })
  @ApiOperation({ summary: 'Unbind a queue from an exchange' })
  async unbindQueue(
    @Param('name') name: string,
    @Param('queue') queueName: string,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
    @Query('bindingKey') bindingKey?: string,
  ) {
    const success = await this.bindingRepo.unbind(
      auth.tenantId,
      name,
      queueName,
      bindingKey ?? '',
    );
    return { success: success };
  }
}
