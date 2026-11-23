import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentVaatiAuth, VaatiRoles } from '@waha/vaati/auth/decorators';
import { VaatiApiKeyGuard } from '@waha/vaati/auth/vaati-api-key.guard';
import { VaatiRbacGuard } from '@waha/vaati/auth/vaati-rbac.guard';
import { VaatiAuthContext, VaatiRole } from '@waha/vaati/types/vaati.types';
import { VaatiWorkerCoordinator } from '@waha/vaati/workers/vaati-worker-coordinator.service';

@ApiTags('VAATI Worker Fleet & Topology')
@ApiBearerAuth()
@ApiHeader({ name: 'x-vaati-api-key', required: false, description: 'VAATI API Key' })
@Controller('api/v1/workers')
@UseGuards(VaatiApiKeyGuard, VaatiRbacGuard)
export class VaatiWorkersController {
  constructor(private readonly coordinator: VaatiWorkerCoordinator) {}

  @Get()
  @VaatiRoles(VaatiRole.ADMIN, VaatiRole.OPERATOR)
  @ApiOperation({ summary: 'List active worker processes and queue allocations' })
  async listWorkers(@CurrentVaatiAuth() auth: VaatiAuthContext) {
    const active = this.coordinator.getActiveWorkers();
    const subs = this.coordinator.getSubscriptions(auth.actorRole === VaatiRole.ADMIN ? undefined : auth.tenantId);

    return {
      activeWorkersCount: active.length,
      workers: active,
      subscriptionsCount: subs.length,
      subscriptions: subs,
    };
  }
}
