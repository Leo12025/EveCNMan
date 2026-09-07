import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization, OrgType } from '../common/entities/organization.entity';
import { Membership } from '../common/entities/membership.entity';
import { Asset } from '../common/entities/asset.entity';
import { TaxRecord } from '../common/entities/tax-record.entity';
import { EveAccount } from '../common/entities/eve-account.entity';
import { TaxesService } from '../taxes/taxes.service';
import { MiningLedger } from '../industry/mining-ledger.entity';
import { SrpClaim } from '../srp/srp.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    @InjectRepository(Asset) private readonly assets: Repository<Asset>,
    @InjectRepository(TaxRecord) private readonly taxes: Repository<TaxRecord>,
    @InjectRepository(EveAccount) private readonly accounts: Repository<EveAccount>,
    @InjectRepository(MiningLedger) private readonly mining: Repository<MiningLedger>,
    @InjectRepository(SrpClaim) private readonly claims: Repository<SrpClaim>,
    private readonly taxesService: TaxesService,
  ) {}

  /** 总览指标 */
  async overview() {
    const [allianceCount, corpCount, memberAgg, assetAgg, accountCount] = await Promise.all([
      this.orgs.count({ where: { type: OrgType.ALLIANCE, isManaged: true } }),
      this.orgs.count({ where: { type: OrgType.CORPORATION, isManaged: true } }),
      this.memberships
        .createQueryBuilder('m')
        .select('COUNT(DISTINCT m.characterId)', 'members')
        .addSelect('COALESCE(SUM(m.sp), 0)', 'totalSp')
        .where('m.isActive = :active', { active: true })
        .getRawOne(),
      this.assets
        .createQueryBuilder('a')
        .select('COALESCE(SUM(a.estimatedValue), 0)', 'totalValue')
        .addSelect('COUNT(*)', 'count')
        .getRawOne(),
      this.accounts.count(),
    ]);

    // 本月税收
    const now = new Date();
    const monthTax = await this.taxes
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount), 0)', 'total')
      .where('t.year = :y AND t.month = :m', { y: now.getFullYear(), m: now.getMonth() + 1 })
      .getRawOne();

    return {
      alliances: allianceCount,
      corporations: corpCount,
      members: Number(memberAgg?.members || 0),
      totalSp: Number(memberAgg?.totalSp || 0),
      totalAssetValue: Number(assetAgg?.totalValue || 0),
      assetCount: Number(assetAgg?.count || 0),
      boundAccounts: accountCount,
      monthTax: Number(monthTax?.total || 0),
    };
  }

  /** 图表数据：税收趋势 + SP 分布 + 活跃度 */
  async charts() {
    const taxTrend = await this.taxesService.trend(6);
    const spDist = await this.memberships
      .createQueryBuilder('m')
      .select(
        `CASE
          WHEN m.sp < 10000000 THEN '0-1000万'
          WHEN m.sp < 30000000 THEN '1000万-3000万'
          WHEN m.sp < 60000000 THEN '3000万-6000万'
          ELSE '6000万+' END`,
        'bucket',
      )
      .addSelect('COUNT(DISTINCT m.characterId)', 'count')
      .where('m.isActive = :active', { active: true })
      .groupBy('bucket')
      .getRawMany();

    const activeTrend = await this.memberships
      .createQueryBuilder('m')
      .select("strftime('%Y-%m', m.lastLogin)", 'month')
      .addSelect('COUNT(DISTINCT m.characterId)', 'count')
      .where('m.isActive = :active AND m.lastLogin IS NOT NULL', { active: true })
      .groupBy('month')
      .orderBy('month', 'DESC')
      .limit(6)
      .getRawMany();

    return {
      taxTrend,
      spDistribution: spDist.map((r) => ({ bucket: r.bucket, count: Number(r.count || 0) })),
      activeTrend: activeTrend.map((r) => ({ month: r.month, count: Number(r.count || 0) })).reverse(),
    };
  }

  /** 矿队产量排行（按角色聚合历史挖掘量） */
  async miningRanking() {
    return this.mining
      .createQueryBuilder('ml')
      .select('ml.characterId', 'characterId')
      .addSelect('ml.characterName', 'characterName')
      .addSelect('COALESCE(SUM(ml.quantity), 0)', 'quantity')
      .addSelect('COALESCE(SUM(ml.value), 0)', 'value')
      .groupBy('ml.characterId')
      .addGroupBy('ml.characterName')
      .orderBy('quantity', 'DESC')
      .limit(10)
      .getRawMany();
  }

  /** KB / 战斗参与排行：以 SRP 战场损失记录数作为战斗参与代理指标 */
  async kbRanking() {
    return this.claims
      .createQueryBuilder('c')
      .select('c.characterId', 'characterId')
      .addSelect('c.characterName', 'characterName')
      .addSelect('COUNT(*)', 'losses')
      .addSelect('COALESCE(SUM(c.lossValue), 0)', 'lossValue')
      .groupBy('c.characterId')
      .addGroupBy('c.characterName')
      .orderBy('losses', 'DESC')
      .limit(10)
      .getRawMany();
  }

  /** 排行榜 */
  async rankings() {
    const [taxRanking, spRanking, activeRanking, miningRanking, kbRanking] = await Promise.all([
      this.taxesService.memberRanking(10),
      this.memberships
        .createQueryBuilder('m')
        .select('m.characterId', 'characterId')
        .addSelect('m.characterName', 'characterName')
        .addSelect('MAX(m.sp)', 'sp')
        .where('m.isActive = :active', { active: true })
        .groupBy('m.characterId')
        .addGroupBy('m.characterName')
        .orderBy('sp', 'DESC')
        .limit(10)
        .getRawMany(),
      this.memberships
        .createQueryBuilder('m')
        .select('m.characterId', 'characterId')
        .addSelect('m.characterName', 'characterName')
        .addSelect('MAX(m.lastLogin)', 'lastLogin')
        .where('m.isActive = :active AND m.lastLogin IS NOT NULL', { active: true })
        .groupBy('m.characterId')
        .addGroupBy('m.characterName')
        .orderBy('lastLogin', 'DESC')
        .limit(10)
        .getRawMany(),
      this.miningRanking(),
      this.kbRanking(),
    ]);

    return {
      taxRanking: taxRanking.map((r, i) => ({ rank: i + 1, ...r })),
      spRanking: spRanking.map((r, i) => ({ rank: i + 1, characterId: Number(r.characterId), characterName: r.characterName, sp: Number(r.sp || 0) })),
      activeRanking: activeRanking.map((r, i) => ({ rank: i + 1, characterId: Number(r.characterId), characterName: r.characterName, lastLogin: r.lastLogin })),
      miningRanking: miningRanking.map((r, i) => ({ rank: i + 1, characterId: Number(r.characterId), characterName: r.characterName, quantity: Number(r.quantity || 0), value: Number(r.value || 0) })),
      kbRanking: kbRanking.map((r, i) => ({ rank: i + 1, characterId: Number(r.characterId), characterName: r.characterName, losses: Number(r.losses || 0), lossValue: Number(r.lossValue || 0) })),
    };
  }

  /** CSV 导出：成员 / 资产 / 税单 / 排行榜 */
  async exportCsv(type: 'members' | 'assets' | 'taxes' | 'rankings', query: { orgId?: number }) {
    const esc = (v: any) => {
      if (v == null) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const toCsv = (headers: string[], rows: any[][]) =>
      [headers.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');

    if (type === 'members') {
      const qb = this.memberships.createQueryBuilder('m').orderBy('m.characterName', 'ASC');
      if (query.orgId) qb.andWhere('m.orgId = :o', { o: query.orgId });
      const rows = await qb.getMany();
      return toCsv(
        ['角色ID', '角色名', '军团', 'SP', '月税', '活跃度', '最后登录', '加入时间', '状态'],
        rows.map((m) => [m.characterId, m.characterName, m.orgId, m.sp ?? 0, m.monthlyTax ?? 0, m.activityTier || 'active', m.lastLogin ? new Date(m.lastLogin).toISOString() : '', m.joinedAt ? new Date(m.joinedAt).toISOString() : '', m.isActive ? '在册' : '已离']),
      );
    }
    if (type === 'assets') {
      const qb = this.assets.createQueryBuilder('a').orderBy('a.estimatedValue', 'DESC');
      if (query.orgId) qb.andWhere('a.ownerId = :o', { o: query.orgId });
      const rows = await qb.take(5000).getMany();
      return toCsv(
        ['类型', '所有者ID', '物品', '数量', '位置', '蓝图', '估值'],
        rows.map((a) => [a.ownerType, a.ownerId, a.typeName, a.quantity, a.locationName || '', a.isBlueprint ? '是' : '', a.estimatedValue]),
      );
    }
    if (type === 'taxes') {
      const rows = await this.taxes.createQueryBuilder('t').orderBy('t.year', 'DESC').addOrderBy('t.month', 'DESC').addOrderBy('t.amount', 'DESC').take(5000).getMany();
      return toCsv(
        ['组织', '年份', '月份', '角色ID', '角色名', '税额'],
        rows.map((t) => [t.orgName, t.year, t.month, t.characterId, t.characterName, t.amount]),
      );
    }
    const rankings = await this.rankings();
    return toCsv(
      ['类型', '排名', '角色ID', '角色名', '数值'],
      [
        ...rankings.spRanking.map((r) => ['SP', r.rank, r.characterId, r.characterName, r.sp]),
        ...rankings.taxRanking.map((r) => ['军税', r.rank, r.characterId, r.characterName, r.total]),
        ...rankings.activeRanking.map((r) => ['活跃', r.rank, r.characterId, r.characterName, r.lastLogin]),
        ...rankings.miningRanking.map((r) => ['挖矿量', r.rank, r.characterId, r.characterName, r.quantity]),
        ...rankings.kbRanking.map((r) => ['战斗', r.rank, r.characterId, r.characterName, r.losses]),
      ],
    );
  }
}
