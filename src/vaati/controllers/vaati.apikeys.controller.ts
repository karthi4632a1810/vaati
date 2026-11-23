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
import { CreateApiKeyDto } from '@waha/vaati/dto/api-key.dto';
import { ApiKeyRepository } from '@waha/vaati/repositories/api-key.repository';
import { AuditLogRepository } from '@waha/vaati/repositories/audit-log.repository';
import { TenantRepository } from '@waha/vaati/repositories/tenant.repository';
import { VaatiAuthContext, VaatiRole } from '@waha/vaati/types/vaati.types';

@ApiTags('VAATI API Key & Credential Management')
@ApiBearerAuth()
@ApiHeader({ name: 'x-vaati-api-key', required: false, description: 'Master Admin API Key' })
@Controller('api/v1/api-keys')
@UseGuards(VaatiApiKeyGuard, VaatiRbacGuard)
export class VaatiApiKeysController {
  constructor(
    private readonly apiKeyRepo: ApiKeyRepository,
    private readonly tenantRepo: TenantRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  @Post()
  @VaatiRoles(VaatiRole.ADMIN)
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({ summary: 'Issue a new tenant-scoped API key with granular RBAC permissions' })
  async createApiKey(
    @Body() dto: CreateApiKeyDto,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
  ) {
    const tenant = await this.tenantRepo.findById(dto.tenantId);
    if (!tenant) {
      throw new NotFoundException(`Tenant ${dto.tenantId} not found`);
    }

    const keyId = `key_${crypto.randomBytes(8).toString('hex')}`;
    const rawSecret = `vaati_${dto.role.toLowerCase()}_${crypto.randomBytes(24).toString('hex')}`;

    const { apiKey, rawKey } = await this.apiKeyRepo.create({
      id: keyId,
      tenantId: dto.tenantId,
      rawKey: rawSecret,
      role: dto.role,
      allowedExchanges: dto.allowedExchanges,
      allowedQueues: dto.allowedQueues,
      expiresAt: dto.expiresAt,
    });

    await this.auditRepo.log({
      tenantId: dto.tenantId,
      actorId: auth.actorId,
      actorRole: auth.actorRole,
      action: 'API_KEY_CREATED',
      resourceType: 'API_KEY',
      resourceId: keyId,
      details: { role: dto.role, keyPrefix: apiKey.keyPrefix },
    });

    return {
      id: apiKey.id,
      tenantId: apiKey.tenantId,
      role: apiKey.role,
      keyPrefix: apiKey.keyPrefix,
      allowedExchanges: apiKey.allowedExchanges,
      allowedQueues: apiKey.allowedQueues,
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
      rawApiKey: rawKey,
    };
  }

  @Get()
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR)
  @ApiQuery({ name: 'tenantId', required: false, description: 'Filter API keys by tenant' })
  @ApiOperation({ summary: 'List API keys for a tenant' })
  async listApiKeys(
    @CurrentVaatiAuth() auth: VaatiAuthContext,
    @Query('tenantId') tenantId?: string,
  ) {
    const targetTenant = tenantId ?? auth.tenantId;
    return await this.apiKeyRepo.findByTenant(targetTenant);
  }

  @Delete(':id')
  @VaatiRoles(VaatiRole.ADMIN)
  @ApiOperation({ summary: 'Revoke an API key immediately' })
  async revokeApiKey(
    @Param('id') id: string,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
  ) {
    const existing = await this.apiKeyRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`API key ${id} not found`);
    }

    await this.apiKeyRepo.revoke(id);

    await this.auditRepo.log({
      tenantId: existing.tenantId,
      actorId: auth.actorId,
      actorRole: auth.actorRole,
      action: 'API_KEY_REVOKED',
      resourceType: 'API_KEY',
      resourceId: id,
    });

    return { success: true, message: `API key ${id} revoked` };
  }
}
