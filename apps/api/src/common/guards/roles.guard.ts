import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasMinRole, type UserRole } from '@ims/shared';
import { IS_PUBLIC_KEY, ROLES_KEY, type AuthUser } from '../decorators/auth.decorators';
import { ForbiddenError } from '../errors/domain-error';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) throw new ForbiddenError();

    const ok = required.some((role) => hasMinRole(user.role, role));
    if (!ok) throw new ForbiddenError();
    return true;
  }
}
