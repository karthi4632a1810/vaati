import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { VAATI_PUBLIC_KEY } from '@waha/vaati/auth/decorators';
import { setVaatiContext } from '@waha/vaati/auth/vaati-tenant.context';
import { VaatiConfigService } from '@waha/vaati/config/vaati.config';
import { ApiKeyRepository } from '@waha/vaati/repositories/api-key.repository';
import { TenantRepository } from '@waha/vaati/repositories/tenant.repository';
import { VaatiAuthContext, VaatiRole, VaatiTenantStatus } from '@waha/vaati/types/vaati.types';

@Injectable()
export class VaatiApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: VaatiConfigService,
    private readonly apiKeyRepo: ApiKeyRepository,
    private readonly tenantRepo: TenantRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(VAATI_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const rawKey = this.extractApiKey(request);

    if (!rawKey) {
      throw new UnauthorizedException('Missing VAATI API key (provide via x-vaati-api-key header or Bearer token)');
    }

    let authContext: VaatiAuthContext;

    // Check if master admin key matches
    if (rawKey === this.config.masterApiKey) {
      const explicitTenant = request.headers['x-vaati-tenant-id'] || request.query?.['tenantId'] || this.config.defaultTenantId;
      const tenant = await this.tenantRepo.findById(String(explicitTenant));
      if (!tenant) {
        throw new ForbiddenException(`Tenant ${explicitTenant} does not exist`);
      }
      if (tenant.status !== VaatiTenantStatus.ACTIVE) {
        throw new ForbiddenException(`Tenant ${tenant.id} is currently ${tenant.status}`);
      }

      authContext = {
        tenantId: tenant.id,
        actorId: 'master_admin',
        actorRole: VaatiRole.ADMIN,
        apiKeyId: 'master_key',
        allowedExchanges: ['*'],
        allowedQueues: ['*'],
      };
    } else {
      const apiKey = await this.apiKeyRepo.findByRawKey(rawKey);
      if (!apiKey) {
        throw new UnauthorizedException('Invalid VAATI API key');
      }

      if (apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now()) {
        throw new UnauthorizedException('VAATI API key has expired');
      }

      const tenant = await this.tenantRepo.findById(apiKey.tenantId);
      if (!tenant || tenant.status !== VaatiTenantStatus.ACTIVE) {
        throw new ForbiddenException('Tenant associated with API key is not active');
      }

      authContext = {
        tenantId: apiKey.tenantId,
        actorId: apiKey.id,
        actorRole: apiKey.role,
        apiKeyId: apiKey.id,
        allowedExchanges: apiKey.allowedExchanges,
        allowedQueues: apiKey.allowedQueues,
      };
    }

    request.vaatiContext = authContext;
    return true;
  }

  private extractApiKey(request: any): string | null {
    const customHeader = request.headers[this.config.apiKeyHeader.toLowerCase()];
    if (customHeader) {
      return Array.isArray(customHeader) ? customHeader[0] : customHeader;
    }

    const standardHeader = request.headers['x-api-key'];
    if (standardHeader) {
      return Array.isArray(standardHeader) ? standardHeader[0] : standardHeader;
    }

    const authHeader = request.headers['authorization'];
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }

    if (request.query?.['x-vaati-api-key']) {
      return String(request.query['x-vaati-api-key']);
    }

    if (request.query?.['x-api-key']) {
      return String(request.query['x-api-key']);
    }

    return null;
  }
}
