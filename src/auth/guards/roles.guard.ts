import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import type { AuthenticatedRequest } from './session-auth.guard.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const routeInstitutionId = request.params?.institutionId;

    const hasRole = request.user.roles.some((userRole) => {
      if (userRole.status !== 'ACTIVE') return false;
      if (!requiredRoles.includes(userRole.role)) return false;
      // SUPER_ADMIN não é vinculado a uma instituição específica.
      if (userRole.role === 'SUPER_ADMIN') return true;
      if (routeInstitutionId) return userRole.institutionId === routeInstitutionId;
      return true;
    });

    if (!hasRole) {
      throw new ForbiddenException('Você não tem permissão para acessar este recurso');
    }

    return true;
  }
}
