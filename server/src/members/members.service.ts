import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Membership } from '../common/entities/membership.entity';
import { EveAccount } from '../common/entities/eve-account.entity';
import { Organization } from '../common/entities/organization.entity';

export interface MemberQuery {
  orgId?: number;
  search?: string;
  active?: string;
  sortBy?: 'sp' | 'name' | 'lastLogin' | 'monthlyTax';
  order?: 'ASC' | 'DESC';
  page?: number;
  pageSize?: number;
}

@Injectable()
export class MembersService {
  constructor(
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    @InjectRepository(EveAccount) private readonly accounts: Repository<EveAccount>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
  ) {}

  async list(query: MemberQuery) {
    const qb = this.memberships.createQueryBuilder('m');
    if (query.orgId) qb.andWhere('m.orgId = :orgId', { orgId: query.orgId });
    if (query.active === 'true') qb.andWhere('m.isActive = :active', { active: true });
    if (query.search) {
      qb.andWhere('m.characterName LIKE :s', { s: `%${query.search}%` });
    }

    const sortMap: Record<string, string> = {
      sp: 'm.sp',
      name: 'm.characterName',
      lastLogin: 'm.lastLogin',
      monthlyTax: 'm.monthlyTax',
    };
    const sortBy = sortMap[query.sortBy] || 'm.sp';
    const order = query.order === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(sortBy, order);

    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize || 50));
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [items, total] = await qb.getManyAndCount();
    // 标记成员是否已绑定 ESI（存在对应 SSO 账号）
    const charIds = items.map((m) => m.characterId);
    const boundIds = new Set<number>();
    if (charIds.length) {
      const bound = await this.accounts
        .createQueryBuilder('a')
        .select('a.characterId', 'characterId')
        .where('a.characterId IN (:...ids)', { ids: charIds })
        .getRawMany();
      bound.forEach((b) => boundIds.add(Number(b.characterId)));
    }
    return {
      items: items.map((m) => ({ ...this.toView(m), bound: boundIds.has(m.characterId) })),
      total,
      page,
      pageSize,
    };
  }

  async detail(characterId: number) {
    const rows = await this.memberships.find({ where: { characterId } });
    if (rows.length === 0) throw new NotFoundException('成员不存在');
    const account = await this.accounts.findOne({ where: { characterId } });
    // 补上各成员关系所属组织的名称 / ticker / 归属联盟，便于详情页直接展示
    const orgIds = [...new Set(rows.map((m) => m.orgId))];
    let orgMap: Record<number, Organization> = {};
    if (orgIds.length) {
      const orgs = await this.orgs.find({ where: orgIds.map((id) => ({ id })) });
      orgMap = Object.fromEntries(orgs.map((o) => [o.id, o]));
    }
    return {
      characterId,
      characterName: rows[0].characterName,
      memberships: rows.map((m) => {
        const org = orgMap[m.orgId];
        return {
          ...this.toView(m),
          note: m.note ?? null,
          tags: m.tags ? JSON.parse(m.tags) : [],
          orgName: org?.name ?? null,
          orgTicker: org?.ticker ?? null,
          orgAllianceId: org?.allianceId ?? null,
          orgManaged: org?.isManaged ?? false,
        };
      }),
      boundAccount: account
        ? {
            id: account.id,
            characterId: account.characterId,
            characterName: account.characterName,
            corporationId: account.corporationId,
            corporationName: account.corporationName,
            allianceId: account.allianceId,
            allianceName: account.allianceName,
            avatarUrl: account.avatarUrl,
            lastSyncedAt: account.lastSyncedAt,
            scopes: account.scopes,
            isMain: account.isMain,
          }
        : null,
    };
  }

  async update(characterId: number, patch: { isActive?: boolean; monthlyTax?: number; roles?: string[] }) {
    const rows = await this.memberships.find({ where: { characterId } });
    if (rows.length === 0) throw new NotFoundException('成员不存在');
    for (const row of rows) {
      if (patch.isActive !== undefined) row.isActive = patch.isActive;
      if (patch.monthlyTax !== undefined) row.monthlyTax = patch.monthlyTax;
      if (patch.roles !== undefined) row.roles = JSON.stringify(patch.roles);
      await this.memberships.save(row);
    }
    return { ok: true };
  }

  async stats() {
    const total = await this.memberships.count({ where: { isActive: true } });
    const spAgg = await this.memberships
      .createQueryBuilder('m')
      .select('SUM(m.sp)', 'total')
      .addSelect('COUNT(DISTINCT m.characterId)', 'characters')
      .where('m.isActive = :active', { active: true })
      .getRawOne();
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const activeRecent = await this.memberships
      .createQueryBuilder('m')
      .select('COUNT(DISTINCT m.characterId)', 'c')
      .where('m.isActive = :active AND m.lastLogin >= :since', {
        active: true,
        since: lastMonth,
      })
      .getRawOne();
    return {
      totalMembers: Number(spAgg?.characters || total),
      totalSp: Number(spAgg?.total || 0),
      activeLastMonth: Number(activeRecent?.c || 0),
    };
  }

  private toView(m: Membership) {
    return {
      id: m.id,
      characterId: m.characterId,
      characterName: m.characterName,
      orgType: m.orgType,
      orgId: m.orgId,
      sp: m.sp ?? 0,
      securityStatus: m.securityStatus,
      lastLogin: m.lastLogin,
      monthlyTax: m.monthlyTax,
      isActive: m.isActive,
      activityTier: m.activityTier || 'active',
      roles: m.roles ? JSON.parse(m.roles) : [],
      joinedAt: m.joinedAt,
      leftAt: m.leftAt,
    };
  }

  /** 按最近活跃时间自动计算活跃度分级 */
  static tierFromActivity(lastActivityAt: Date | null, isActive: boolean): string {
    if (!isActive) return 'left';
    if (!lastActivityAt) return 'idle';
    const days = (Date.now() - new Date(lastActivityAt).getTime()) / 86400000;
    if (days <= 7) return 'core';
    if (days <= 30) return 'active';
    if (days <= 90) return 'casual';
    return 'idle';
  }

  /** 批量重算活跃度分级（定时/手动触发） */
  async recomputeTiers(orgId?: number) {
    const qb = this.memberships.createQueryBuilder('m');
    if (orgId) qb.andWhere('m.orgId = :orgId', { orgId });
    const rows = await qb.getMany();
    let changed = 0;
    for (const m of rows) {
      const tier = MembersService.tierFromActivity(m.lastActivityAt, m.isActive);
      if (tier !== m.activityTier) {
        m.activityTier = tier;
        await this.memberships.save(m);
        changed++;
      }
    }
    return { ok: true, scanned: rows.length, changed };
  }

  async tierStats(orgId?: number) {
    const qb = this.memberships.createQueryBuilder('m').select('m.activityTier', 'tier').addSelect('COUNT(*)', 'c');
    if (orgId) qb.where('m.orgId = :orgId', { orgId });
    else qb.where('m.isActive = :a', { a: true });
    qb.groupBy('m.activityTier');
    const raw = await qb.getRawMany();
    const map: Record<string, number> = { core: 0, active: 0, casual: 0, idle: 0, left: 0 };
    raw.forEach((r) => (map[r.tier] = Number(r.c)));
    return map;
  }
}
