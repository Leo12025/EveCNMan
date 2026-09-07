import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** 声明接口所需的最低权限：@Roles('admin') 允许 admin 及以上 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
