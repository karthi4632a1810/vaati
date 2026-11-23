import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { VAATI_PUBLIC_KEY, VAATI_ROLES_KEY } from '@waha/vaati/auth/decorators';
import { VaatiRole } from '@waha/vaati/types/vaati.types';

@Injectable()
export class VaatiRbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(VAATI_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<VaatiRole[]>(VAATI_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const vaatiContext = request.vaatiContext;

    if (!vaatiContext) {
      throw new UnauthorizedException('VAATI context is required for role validation');
    }

    const actorRole = vaatiContext.actorRole as VaatiRole;

    // ADMIN has full permissions
    if (actorRole === VaatiRole.ADMIN) {
      return true;
    }

    // OPERATOR satisfies PUBLISHER and CONSUMER
    if (actorRole === VaatiRole.OPERATOR) {
      if (
        requiredRoles.includes(VaatiRole.OPERATOR) ||
        requiredRoles.includes(VaatiRole.PUBLISHER) ||
        requiredRoles.includes(VaatiRole.CONSUMER) ||
        requiredRoles.includes(VaatiRole.AUDITOR)
      ) {
        return true;
      }
    }

    // Direct role match
    if (requiredRoles.includes(actorRole)) {
      return true;
    }

    throw new ForbiddenException(
      `Role ${actorRole} does not satisfy required roles [${requiredRoles.join(', ')}]`,
    );
  }
}
