import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

const ROLE_LEVEL: Record<string, number> = {
  viewer: 1,
  member: 2,
  officer: 3,
  admin: 3,
  super_admin: 4,
};

/** 基于最低权限等级的角色守卫（viewer < member < admin < super_admin） */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) throw new ForbiddenException('未登录');

    const userLevel = ROLE_LEVEL[user.role] ?? 0;
    const requiredLevel = Math.max(...required.map((r) => ROLE_LEVEL[r] ?? 0));
    if (userLevel < requiredLevel) {
      throw new ForbiddenException('权限不足');
    }
    return true;
  }
}
