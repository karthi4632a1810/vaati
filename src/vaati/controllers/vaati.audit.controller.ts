import { Controller, Get, Query, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WAHAValidationPipe } from '@waha/nestjs/pipes/WAHAValidationPipe';
import { CurrentVaatiAuth, VaatiRoles } from '@waha/vaati/auth/decorators';
import { VaatiApiKeyGuard } from '@waha/vaati/auth/vaati-api-key.guard';
import { VaatiRbacGuard } from '@waha/vaati/auth/vaati-rbac.guard';
import { AuditQueryDto } from '@waha/vaati/observability/dto/audit-query.dto';
import { AuditLogRepository } from '@waha/vaati/repositories/audit-log.repository';
import { VaatiAuthContext, VaatiRole } from '@waha/vaati/types/vaati.types';

@ApiTags('VAATI Audit & Compliance Trail')
@ApiBearerAuth()
@ApiHeader({ name: 'x-vaati-api-key', required: false, description: 'VAATI API Key' })
@Controller('api/v1/audit')
@UseGuards(VaatiApiKeyGuard, VaatiRbacGuard)
export class VaatiAuditController {
  constructor(private readonly auditRepo: AuditLogRepository) {}

  @Get()
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR, VaatiRole.AUDITOR)
  @UsePipes(new WAHAValidationPipe())
  @ApiOperation({ summary: 'Query immutable tenant audit logs and administrative events' })
  async getAuditLogs(
    @CurrentVaatiAuth() auth: VaatiAuthContext,
    @Query() query: AuditQueryDto,
  ) {
    const logs = await this.auditRepo.findByTenant(auth.tenantId, {
      action: query.action,
      resourceType: query.resourceType,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });

    return {
      total: logs.length,
      items: logs,
    };
  }
}
