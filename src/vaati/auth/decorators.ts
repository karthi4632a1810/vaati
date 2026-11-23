import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { getVaatiContext } from '@waha/vaati/auth/vaati-tenant.context';
import { VaatiRole } from '@waha/vaati/types/vaati.types';

export const VAATI_ROLES_KEY = 'vaati_roles';
export const VAATI_PUBLIC_KEY = 'vaati_public_route';

export function VaatiRoles(...roles: VaatiRole[]) {
  return SetMetadata(VAATI_ROLES_KEY, roles);
}

export function PublicVaatiRoute() {
  return SetMetadata(VAATI_PUBLIC_KEY, true);
}

export const CurrentTenant = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const contextFromReq = request.vaatiContext;
    if (contextFromReq) {
      return contextFromReq.tenantId;
    }
    const store = getVaatiContext();
    return store?.tenantId;
  },
);

export const CurrentVaatiAuth = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const contextFromReq = request.vaatiContext;
    if (contextFromReq) {
      return contextFromReq;
    }
    return getVaatiContext();
  },
);
