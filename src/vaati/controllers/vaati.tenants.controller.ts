import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WAHAValidationPipe } from '@waha/nestjs/pipes/WAHAValidationPipe';
import { CurrentVaatiAuth, VaatiRoles } from '@waha/vaati/auth/decorators';
import { VaatiApiKeyGuard } from '@waha/vaati/auth/vaati-api-key.guard';
import { VaatiRbacGuard } from '@waha/vaati/auth/vaati-rbac.guard';
import {
  CreateTenantDto,
  UpdateTenantQuotasDto,
  UpdateTenantStatusDto,
} from '@waha/vaati/dto/tenant.dto';
import { AuditLogRepository } from '@waha/vaati/repositories/audit-log.repository';
import { TenantRepository } from '@waha/vaati/repositories/tenant.repository';
import { VaatiAuthContext, VaatiRole } from '@waha/vaati/types/vaati.types';

@ApiTags('VAATI Tenant Management')
@ApiBearerAuth()
@ApiHeader({ name: 'x-vaati-api-key', required: false, description: 'Master Admin API Key' })
@Controller('api/v1/tenants')
@UseGuards(VaatiApiKeyGuard, VaatiRbacGuard)
export class VaatiTenantsController {
  constructor(
    private readonly tenantRepo: TenantRepository,
    private readonly auditRepo: AuditLogRepository,
  ) {}

  @Post()
  @VaatiRoles(VaatiRole.ADMIN)
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({ summary: 'Create a new tenant with dedicated quotas and isolation' })
  async createTenant(
    @Body() dto: CreateTenantDto,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
  ) {
    const tenant = await this.tenantRepo.create({
      id: dto.id,
      name: dto.name,
      status: dto.status,
      rateLimitPerMinute: dto.rateLimitPerMinute,
      maxQueues: dto.maxQueues,
      maxPayloadBytes: dto.maxPayloadBytes,
    });

    await this.auditRepo.log({
      tenantId: tenant.id,
      actorId: auth.actorId,
      actorRole: auth.actorRole,
      action: 'TENANT_CREATED',
      resourceType: 'TENANT',
      resourceId: tenant.id,
      details: { name: tenant.name, quotas: { rateLimitPerMinute: tenant.rateLimitPerMinute } },
    });

    return tenant;
  }

  @Get()
  @VaatiRoles(VaatiRole.ADMIN)
  @ApiOperation({ summary: 'List all registered tenants' })
  async listTenants() {
    return await this.tenantRepo.findAll();
  }

  @Get(':id')
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR)
  @ApiOperation({ summary: 'Get details of a specific tenant' })
  async getTenant(@Param('id') id: string) {
    const tenant = await this.tenantRepo.findById(id);
    if (!tenant) {
      throw new NotFoundException(`Tenant ${id} not found`);
    }
    return tenant;
  }

  @Put(':id/status')
  @VaatiRoles(VaatiRole.ADMIN)
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({ summary: 'Update tenant operational status (ACTIVE, SUSPENDED, DECOMMISSIONED)' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTenantStatusDto,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
  ) {
    const tenant = await this.tenantRepo.findById(id);
    if (!tenant) {
      throw new NotFoundException(`Tenant ${id} not found`);
    }

    await this.tenantRepo.updateStatus(id, dto.status);

    await this.auditRepo.log({
      tenantId: id,
      actorId: auth.actorId,
      actorRole: auth.actorRole,
      action: 'TENANT_STATUS_UPDATED',
      resourceType: 'TENANT',
      resourceId: id,
      details: { oldStatus: tenant.status, newStatus: dto.status },
    });

    return await this.tenantRepo.findById(id);
  }

  @Put(':id/quotas')
  @VaatiRoles(VaatiRole.ADMIN)
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({ summary: 'Update rate limits and resource quotas for a tenant' })
  async updateQuotas(
    @Param('id') id: string,
    @Body() dto: UpdateTenantQuotasDto,
    @CurrentVaatiAuth() auth: VaatiAuthContext,
  ) {
    const tenant = await this.tenantRepo.findById(id);
    if (!tenant) {
      throw new NotFoundException(`Tenant ${id} not found`);
    }

    await this.tenantRepo.updateQuotas(id, {
      rateLimitPerMinute: dto.rateLimitPerMinute,
      maxQueues: dto.maxQueues,
      maxPayloadBytes: dto.maxPayloadBytes,
    });

    await this.auditRepo.log({
      tenantId: id,
      actorId: auth.actorId,
      actorRole: auth.actorRole,
      action: 'TENANT_QUOTAS_UPDATED',
      resourceType: 'TENANT',
      resourceId: id,
      details: { ...dto },
    });

    return await this.tenantRepo.findById(id);
  }
}
