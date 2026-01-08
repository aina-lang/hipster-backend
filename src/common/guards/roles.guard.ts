import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/role.decorator';
import { Role } from '../enums/role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) {
      return true;
    }
    const request = context
      .switchToHttp()
      .getRequest<{ user?: { roles?: Role[] | string[] } }>(); // Allow string[]

    const userRolesRaw = request.user?.roles ?? [];

    const userRoles: string[] = [];

    // Nettoyage et parsing des rôles (gestion du cas double-encodage JSON)
    for (const role of userRolesRaw) {
      if (
        typeof role === 'string' &&
        role.startsWith('[') &&
        role.endsWith(']')
      ) {
        try {
          const parsed = JSON.parse(role);
          if (Array.isArray(parsed)) {
            parsed.forEach((r) =>
              userRoles.push(String(r).toLowerCase().trim()),
            );
          } else {
            userRoles.push(role.toLowerCase().trim());
          }
        } catch {
          userRoles.push(role.toLowerCase().trim());
        }
      } else {
        userRoles.push(String(role).toLowerCase().trim());
      }
    }

    // Normalisation des rôles requis
    const requiredRolesNormalized = requiredRoles.map((r) =>
      r.toLowerCase().trim(),
    );

    // Vérification
    return requiredRolesNormalized.some((role) => userRoles.includes(role));
  }
}
