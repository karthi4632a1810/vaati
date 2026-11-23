import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { VAATI_PUBLIC_KEY, VAATI_ROLES_KEY } from '@waha/vaati/auth/decorators';
import { VaatiApiKeyGuard } from '@waha/vaati/auth/vaati-api-key.guard';
import { VaatiRbacGuard } from '@waha/vaati/auth/vaati-rbac.guard';
import { VaatiConfigService } from '@waha/vaati/config/vaati.config';
import { ApiKeyRepository } from '@waha/vaati/repositories/api-key.repository';
import { TenantRepository } from '@waha/vaati/repositories/tenant.repository';
import { VaatiRole, VaatiTenantStatus } from '@waha/vaati/types/vaati.types';

describe('VAATI Auth & RBAC Guards Test Suite', () => {
  let reflector: Reflector;
  let config: VaatiConfigService;
  let apiKeyRepo: jest.Mocked<ApiKeyRepository>;
  let tenantRepo: jest.Mocked<TenantRepository>;
  let apiKeyGuard: VaatiApiKeyGuard;
  let rbacGuard: VaatiRbacGuard;

  beforeEach(() => {
    reflector = new Reflector();
    config = {
      apiKeyHeader: 'x-vaati-api-key',
      masterApiKey: 'master_secret_666',
      defaultTenantId: 'default',
    } as any;

    apiKeyRepo = {
      findByRawKey: jest.fn(),
    } as any;

    tenantRepo = {
      findById: jest.fn(),
    } as any;

    apiKeyGuard = new VaatiApiKeyGuard(reflector, config, apiKeyRepo, tenantRepo);
    rbacGuard = new VaatiRbacGuard(reflector);
  });

  function createMockContext(headers: Record<string, string> = {}, vaatiContext?: any): ExecutionContext {
    const request = {
      headers: headers,
      query: {},
      vaatiContext: vaatiContext,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
  }

  describe('VaatiApiKeyGuard', () => {
    test('authenticates with master API key and populates ADMIN role', async () => {
      tenantRepo.findById.mockResolvedValueOnce({
        id: 'default',
        status: VaatiTenantStatus.ACTIVE,
      } as any);

      const ctx = createMockContext({ 'x-vaati-api-key': 'master_secret_666' });
      const allowed = await apiKeyGuard.canActivate(ctx);

      expect(allowed).toBe(true);
      const req = ctx.switchToHttp().getRequest();
      expect(req.vaatiContext).toBeDefined();
      expect(req.vaatiContext.actorRole).toBe(VaatiRole.ADMIN);
      expect(req.vaatiContext.tenantId).toBe('default');
    });

    test('authenticates with scoped API key and respects tenant status', async () => {
      apiKeyRepo.findByRawKey.mockResolvedValueOnce({
        id: 'key_1',
        tenantId: 'hosp_01',
        role: VaatiRole.PUBLISHER,
        allowedExchanges: ['*'],
        allowedQueues: ['*'],
        expiresAt: null,
      } as any);

      tenantRepo.findById.mockResolvedValueOnce({
        id: 'hosp_01',
        status: VaatiTenantStatus.ACTIVE,
      } as any);

      const ctx = createMockContext({ authorization: 'Bearer scoped_token_abc' });
      const allowed = await apiKeyGuard.canActivate(ctx);

      expect(allowed).toBe(true);
      const req = ctx.switchToHttp().getRequest();
      expect(req.vaatiContext.tenantId).toBe('hosp_01');
      expect(req.vaatiContext.actorRole).toBe(VaatiRole.PUBLISHER);
    });

    test('throws UnauthorizedException when no API key provided', async () => {
      const ctx = createMockContext({});
      await expect(apiKeyGuard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    test('throws ForbiddenException when tenant is SUSPENDED', async () => {
      apiKeyRepo.findByRawKey.mockResolvedValueOnce({
        id: 'key_1',
        tenantId: 'hosp_01',
        role: VaatiRole.PUBLISHER,
        expiresAt: null,
      } as any);

      tenantRepo.findById.mockResolvedValueOnce({
        id: 'hosp_01',
        status: VaatiTenantStatus.SUSPENDED,
      } as any);

      const ctx = createMockContext({ 'x-vaati-api-key': 'scoped_key' });
      await expect(apiKeyGuard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('VaatiRbacGuard', () => {
    test('grants access when role matches required role', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: string) => {
        if (key === VAATI_ROLES_KEY) {
          return [VaatiRole.PUBLISHER];
        }
        return false;
      });
      const ctx = createMockContext({}, { actorRole: VaatiRole.PUBLISHER });

      expect(rbacGuard.canActivate(ctx)).toBe(true);
    });

    test('ADMIN role satisfies any requirement', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: string) => {
        if (key === VAATI_ROLES_KEY) {
          return [VaatiRole.CONSUMER];
        }
        return false;
      });
      const ctx = createMockContext({}, { actorRole: VaatiRole.ADMIN });

      expect(rbacGuard.canActivate(ctx)).toBe(true);
    });

    test('throws ForbiddenException when role is insufficient', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: string) => {
        if (key === VAATI_ROLES_KEY) {
          return [VaatiRole.ADMIN];
        }
        return false;
      });
      const ctx = createMockContext({}, { actorRole: VaatiRole.CONSUMER });

      expect(() => rbacGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });
});
