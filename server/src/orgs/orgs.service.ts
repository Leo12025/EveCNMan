import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Organization, OrgType } from '../common/entities/organization.entity';
import { Membership } from '../common/entities/membership.entity';
import { EveAccount } from '../common/entities/eve-account.entity';
import { EsiService } from '../esi/esi.service';

export interface CreateOrgDto {
  id: number;
  type: OrgType;
  name: string;
  ticker?: string;
  allianceId?: number | null;
  isManaged?: boolean;
  taxRate?: number;
  notes?: string;
}

@Injectable()
export class OrgsService {
  constructor(
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    @InjectRepository(EveAccount) private readonly accounts: Repository<EveAccount>,
    private readonly esi: EsiService,
  ) {}

  async list(query: { managedOnly?: boolean; type?: OrgType; search?: string }) {
    const qb = this.orgs.createQueryBuilder('o');
    if (query.managedOnly) qb.where('o.isManaged = :m', { m: true });
    if (query.type) qb.andWhere('o.type = :t', { t: query.type });
    if (query.search) {
      qb.andWhere('(o.name LIKE :s OR o.ticker LIKE :s)', { s: `%${query.search}%` });
    }
    qb.orderBy('o.isManaged', 'DESC').addOrderBy('o.name', 'ASC');
    const rows = await qb.getMany();
    return this.withExecutorInfo(await this.withCorpAuth(await this.withMemberCounts(rows)));
  }

  /**
   * 标注军团授权就绪状态：军团类型组织是否至少有一名「已完成军团授权」的绑定角色在籍，
   * 只有此类组织才能按军团级数据（钱包/成员/资产/合同等）拉取。
   * 输出追加字段：corpAuthorized: boolean、corpAuthCount: number。
   */
  private async withCorpAuth<T extends Organization>(items: T[]) {
    const corpIds = items.filter((o) => o.type === OrgType.CORPORATION).map((o) => o.id);
    const counts = await this.corpAuthCounts(corpIds);
    return items.map((o) =>
      o.type === OrgType.CORPORATION
        ? { ...o, corpAuthorized: (counts[o.id] ?? 0) > 0, corpAuthCount: counts[o.id] ?? 0 }
        : o,
    );
  }

  /**
   * 追加联盟/执行军团标记：
   * - 联盟行：executorName / executorTicker（执行军团名称，供表头与列表展示）；
   * - 军团行：isExecutor（是否为所属联盟的执行军团，便于打"执行军团"标签）。
   */
  private async withExecutorInfo(items: any[]): Promise<any[]> {
    const execIds = [
      ...new Set(items.filter((o) => o.type === OrgType.ALLIANCE && o.executorCorporationId).map((o) => o.executorCorporationId)),
    ];
    const execOrgs = execIds.length ? await this.orgs.find({ where: { id: In(execIds) } }) : [];
    const nameMap = new Map(execOrgs.map((o) => [o.id, o]));
    const executorIds = new Set(execIds);
    return items.map((o) => {
      if (o.type === OrgType.ALLIANCE) {
        const exec = nameMap.get(o.executorCorporationId);
        return { ...o, executorName: exec?.name ?? null, executorTicker: exec?.ticker ?? null };
      }
      if (o.type === OrgType.CORPORATION) return { ...o, isExecutor: executorIds.has(o.id) };
      return o;
    });
  }

  /** 统计各军团组织内「军团授权账号」数量（在籍成员中已绑定且 scopes 含军团管理 scope） */
  private async corpAuthCounts(orgIds: number[]): Promise<Record<number, number>> {
    if (orgIds.length === 0) return {};
    const rows: { orgId: number; scopes: string }[] = await this.memberships
      .createQueryBuilder('m')
      .innerJoin(
        EveAccount,
        'a',
        'a.characterId = m.characterId AND a.accessToken IS NOT NULL AND a.accessToken != \'\'',
      )
      .select('m.orgId', 'orgId')
      .addSelect('a.scopes', 'scopes')
      .where('m.isActive = :active AND m.orgId IN (:...orgIds)', { active: true, orgIds })
      .getRawMany();
    const counts: Record<number, number> = {};
    for (const r of rows) {
      if (this.esi.hasCorpAuth(r.scopes)) counts[r.orgId] = (counts[r.orgId] || 0) + 1;
    }
    return counts;
  }

  /**
   * 组织展示人数（memberCount）计算口径：
   * - 军团：优先「真实在册名单数」（军团授权同步来的 memberships）；无名单时回退 ESI 公开 member_count 快照。
   * - 联盟：下属军团人数之和（下属行可能因列表搜索被过滤，故独立取全量子军团数据）。
   */
  private async withMemberCounts(items: any[]) {
    if (!items.length) return items;
    const alliances = items.filter((o) => o.type === OrgType.ALLIANCE);
    let extraCorps: Organization[] = [];
    for (const a of alliances) {
      extraCorps = extraCorps.concat(await this.orgs.find({ where: { type: OrgType.CORPORATION, allianceId: a.id } }));
    }
    const orgIds = [...new Set(items.concat(extraCorps).map((o) => o.id))];
    const rosterRows: { orgId: number; c: number }[] = await this.memberships
      .createQueryBuilder('m')
      .select('m.orgId', 'orgId')
      .addSelect('COUNT(*)', 'c')
      .where('m.orgId IN (:...orgIds) AND m.isActive = :active', { orgIds, active: true })
      .groupBy('m.orgId')
      .getRawMany();
    const roster = new Map(rosterRows.map((r) => [Number(r.orgId), Number(r.c)]));
    const eff = (o: any) => {
      const cnt = roster.get(o.id) ?? 0;
      return cnt > 0 ? cnt : (o.esiMemberCount ?? 0);
    };
    return items.map((o) => {
      if (o.type === OrgType.CORPORATION) return { ...o, memberCount: eff(o) };
      const childSum = extraCorps.filter((c) => c.allianceId === o.id).reduce((s, c) => s + eff(c), 0);
      return { ...o, memberCount: childSum > 0 ? childSum : (roster.get(o.id) ?? 0) };
    });
  }

  async detail(id: number) {
    const org = await this.orgs.findOne({ where: { id } });
    if (!org) throw new NotFoundException('组织不存在');
    const roster = await this.memberships.count({ where: { orgId: id, isActive: true } });
    const spAgg = await this.memberships
      .createQueryBuilder('m')
      .select('SUM(m.sp)', 'total')
      .where('m.orgId = :id AND m.isActive = :active', { id, active: true })
      .getRawOne();
    // 军团：有真实名单用名单数，否则展示 ESI 公开人数
    const memberCount = roster > 0 ? roster : org.esiMemberCount ?? 0;
    return { ...org, memberCount, totalSp: Number(spAgg?.total || 0) };
  }

  async create(dto: CreateOrgDto) {
    if (!dto.id || !dto.name) throw new BadRequestException('缺少组织 ID 或名称');
    const existing = await this.orgs.findOne({ where: { id: dto.id } });
    if (existing) {
      return this.orgs.save(this.orgs.merge(existing, dto as Partial<Organization>));
    }
    return this.orgs.save(this.orgs.create({ ...dto, isManaged: dto.isManaged ?? false }));
  }

  async update(id: number, patch: Partial<CreateOrgDto>) {
    const org = await this.orgs.findOne({ where: { id } });
    if (!org) throw new NotFoundException('组织不存在');
    return this.orgs.save(this.orgs.merge(org, patch));
  }

  /** 组织树：联盟 → 军团 → 成员（含未挂联盟的独立军团） */
  async tree(managedOnly = true) {
    const where = managedOnly ? { isManaged: true } : {};
    const orgs = await this.withExecutorInfo(await this.withCorpAuth(await this.orgs.find({ where })));
    const alliances = orgs.filter((o) => o.type === OrgType.ALLIANCE);
    const corps = orgs.filter((o) => o.type === OrgType.CORPORATION);

    const getMembers = async (orgId: number) => {
      const list = await this.memberships.find({
        where: { orgId, isActive: true },
        order: { sp: 'DESC' },
      });
      return list.map((m) => ({
        characterId: m.characterId,
        characterName: m.characterName,
        sp: m.sp ?? 0,
        securityStatus: m.securityStatus,
        monthlyTax: m.monthlyTax,
        lastLogin: m.lastLogin,
        roles: m.roles ? JSON.parse(m.roles) : [],
      }));
    };

    const result = [];
    for (const alliance of alliances) {
      const children = corps.filter((c) => c.allianceId === alliance.id);
      const childNodes = [];
      for (const c of children) {
        const members = await getMembers(c.id);
        childNodes.push({
          ...c,
          members,
          memberCount: members.length > 0 ? members.length : (c.esiMemberCount ?? 0),
        });
      }
      const ownMembers = await getMembers(alliance.id);
      const childSum = childNodes.reduce((s, n) => s + (n.memberCount || 0), 0);
      result.push({
        ...alliance,
        children: childNodes,
        members: ownMembers,
        memberCount: childSum > 0 ? childSum : ownMembers.length,
      });
    }
    // 未挂任何联盟的独立军团
    const allianceIds = new Set(alliances.map((a) => a.id));
    const standalone = corps.filter((c) => c.allianceId == null || !allianceIds.has(c.allianceId));
    for (const c of standalone) {
      const members = await getMembers(c.id);
      result.push({
        ...c,
        children: [],
        members,
        memberCount: members.length > 0 ? members.length : (c.esiMemberCount ?? 0),
      });
    }
    return result;
  }

  /** 当前登录用户可管理组织：名下账号（平台账号=聚合角色并集；EVE 角色=自身）所属的联盟/军团 */
  async myOrgs(userId: number) {
    const accounts = await this.accounts.find({
      where: [{ user: { id: userId } }, { platformUser: { id: userId } }],
    });
    const ids = new Set<number>();
    for (const acc of accounts) {
      if (acc.corporationId) ids.add(acc.corporationId);
      if (acc.allianceId) ids.add(acc.allianceId);
    }
    if (ids.size === 0) return [];
    return this.orgs.find({ where: [...ids].map((id) => ({ id })) });
  }

  async remove(id: number) {
    const org = await this.orgs.findOne({ where: { id } });
    if (!org) throw new NotFoundException('组织不存在');
    await this.orgs.remove(org);
    return { ok: true };
  }
}
