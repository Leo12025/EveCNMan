import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, type UserRole } from '../common/entities/user.entity';
import { EveAccount } from '../common/entities/eve-account.entity';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { hashPassword } from './password.util';

const ALLOWED_ROLES = ['super_admin', 'admin', 'member', 'viewer'];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UserController {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(EveAccount) private readonly accounts: Repository<EveAccount>,
  ) {}

  /** 用户列表（仅超管/管理员）；EVE 角色身份附带对应角色名 */
  @Get()
  @Roles('super_admin', 'admin')
  async list() {
    const users = await this.users.find({ order: { id: 'ASC' } });
    const ids = users.map((u) => u.id);
    const nameById: Record<number, string> = {};
    if (ids.length) {
      const rows: { userId: number; characterName: string }[] = await this.accounts
        .createQueryBuilder('a')
        .select('a.userId', 'userId')
        .addSelect('a.characterName', 'characterName')
        .where('a.userId IN (:...ids)', { ids })
        .getRawMany();
      for (const r of rows) nameById[Number(r.userId)] = r.characterName;
    }
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      kind: u.kind,
      role: u.role,
      isActive: u.isActive,
      createdAt: u.createdAt,
      /** EVE 角色身份对应的角色名（kind=eve 时有值；平台账号为 null） */
      characterName: u.kind === 'eve' ? (nameById[u.id] ?? null) : null,
    }));
  }

  /** 新建平台账号（超管；平台账号使用用户名+密码登录，可聚合名下多个 EVE 角色） */
  @Post()
  @Roles('super_admin')
  async create(@Body() body: { username?: string; password?: string; role?: string }) {
    const username = (body.username || '').trim();
    if (!username) throw new BadRequestException('请输入用户名');
    if (/^eve:/i.test(username)) {
      throw new BadRequestException('用户名不能以 eve: 开头（保留给 EVE 角色身份使用）');
    }
    const password = body.password || '';
    if (password.length < 6) throw new BadRequestException('密码至少 6 位');
    const role = (ALLOWED_ROLES.includes(body.role || '') ? body.role : 'member') as UserRole;

    const exists = await this.users.findOne({ where: { username } });
    if (exists) throw new BadRequestException(`用户名「${username}」已存在`);

    const user = await this.users.save(
      this.users.create({ username, kind: 'platform', role, passwordHash: hashPassword(password) }),
    );
    return { id: user.id, username: user.username, kind: user.kind, role: user.role, createdAt: user.createdAt };
  }

  /** 重置平台账号密码（超管） */
  @Put(':id/password')
  @Roles('super_admin')
  async resetPassword(@Param('id') id: string, @Body() body: { password?: string }) {
    const password = body.password || '';
    if (password.length < 6) throw new BadRequestException('密码至少 6 位');
    const user = await this.users.findOne({ where: { id: Number(id) } });
    if (!user) return { error: '用户不存在' };
    if (user.kind !== 'platform') {
      return { error: '该账号为 EVE 角色身份，不能设置密码；请新建平台账号后进行多角色管理' };
    }
    user.passwordHash = hashPassword(password);
    await this.users.save(user);
    return { ok: true, id: user.id, username: user.username };
  }

  /** 更新用户角色 */
  @Put(':id/role')
  @Roles('super_admin')
  async setRole(@Param('id') id: string, @Body() body: { role: string }, @CurrentUser() me: AuthUser) {
    if (!ALLOWED_ROLES.includes(body.role)) {
      return { error: '非法角色', allowed: ALLOWED_ROLES };
    }
    if (Number(id) === me.sub) {
      return { error: '不能修改自己的角色' };
    }
    const user = await this.users.findOne({ where: { id: Number(id) } });
    if (!user) return { error: '用户不存在' };
    user.role = body.role as UserRole;
    await this.users.save(user);
    return { id: user.id, username: user.username, role: user.role };
  }

  /**
   * 删除用户（超管；不能删除自己）。
   * 事务内先把历史业务记录中的关联置空（保留记录、字段显示为空），再删除用户本体；
   * eve_accounts 的归属关系由外键策略自动处理（自身账号 CASCADE、平台绑定 SET NULL）。
   */
  @Delete(':id')
  @Roles('super_admin')
  async remove(@Param('id') id: string, @CurrentUser() me: AuthUser) {
    const uid = Number(id);
    if (uid === me.sub) return { error: '不能删除自己' };
    const user = await this.users.findOne({ where: { id: uid } });
    if (!user) return { error: '用户不存在' };

    await this.users.manager.transaction(async (em) => {
      // 支出/招募/SRP/舰队的申请人·审核人·指挥官置空（业务记录本身保留）
      // 表名/列名以当前 schema 为准（外键列均可空，见 PRAGMA foreign_key_list）
      const detachTables: [string, string][] = [
        ['expenses', 'applicantId'],
        ['expenses', 'reviewerId'],
        ['recruits', 'reviewerId'],
        ['srp_claims', 'reviewerId'],
        ['fleets', 'commanderId'],
      ];
      for (const [table, column] of detachTables) {
        await em.query(`UPDATE "${table}" SET "${column}" = NULL WHERE "${column}" = ?`, [uid]);
      }
      // 删除用户（eve_accounts.userId CASCADE 移除其名下角色账号；platformUserId 外键自动置 NULL）
      await em.delete(User, uid);
    });
    return { ok: true };
  }
}
