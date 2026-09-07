import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SrpClaim, SrpStatus } from './srp.entity';
import { SrpRule } from './srp-rule.entity';
import { EsiService } from '../esi/esi.service';
import { User } from '../common/entities/user.entity';
import { NotifyService } from '../notify/notify.service';

@Injectable()
export class SrpService {
  constructor(
    @InjectRepository(SrpClaim) private readonly claims: Repository<SrpClaim>,
    @InjectRepository(SrpRule) private readonly rules: Repository<SrpRule>,
    private readonly esi: EsiService,
    private readonly notify: NotifyService,
  ) {}

  // ---------- 报销规则 ----------
  listRules(orgId: number) {
    return this.rules.find({ where: { orgId } });
  }

  upsertRule(dto: Partial<SrpRule>) {
    return this.rules.save(this.rules.create(dto));
  }

  removeRule(id: number) {
    return this.rules.delete(id);
  }

  private priceCache: Map<number, number> | null = null;
  private priceCacheAt = 0;

  private async marketPrice(typeId: number): Promise<number> {
    if (!this.priceCache || Date.now() - this.priceCacheAt > 3600_000) {
      try {
        const prices = await this.esi.getMarketPrices();
        this.priceCache = new Map();
        for (const p of prices || []) {
          if (p.type_id != null && p.average_price != null) this.priceCache.set(p.type_id, p.average_price);
        }
        this.priceCacheAt = Date.now();
      } catch {
        this.priceCache = this.priceCache || new Map();
      }
    }
    return this.priceCache.get(typeId) || 0;
  }

  // ---------- killmail 导入核验 ----------
  /** 从 zKillboard 导入 killmail 并生成报销申请（自动匹配规则计算 payout） */
  async importKillmail(dto: { orgId: number; orgType: string; killmailId: number; hash?: string; characterId?: number; characterName?: string }) {
    const km = await this.esi.getKillmail(dto.killmailId, dto.hash).catch(() => null);
    if (!km) throw new NotFoundException('killmail 不存在或无法获取');
    const victim = km.victim || {};
    const shipTypeId = victim.ship_type_id;
    const shipName = await this.esi.resolveName(shipTypeId).catch(() => null);
    const lossValue = await this.estimateLossValue(km).catch(() => 0);
    const rule = await this.matchRule(dto.orgId, shipTypeId);
    const ratio = rule?.ratio ?? 0;
    const cap = rule?.cap ?? 0;
    const rawPayout = lossValue * ratio;
    const payout = cap > 0 ? Math.min(rawPayout, cap) : rawPayout;
    return this.claims.save(
      this.claims.create({
        orgId: dto.orgId,
        orgType: dto.orgType || 'corporation',
        characterId: dto.characterId || victim.character_id || 0,
        characterName: dto.characterName || victim.character_name || null,
        killmailId: dto.killmailId,
        killmailHash: 0,
        shipTypeId,
        shipName,
        lossValue: Math.round(lossValue),
        payoutRatio: ratio,
        payout: Math.round(payout),
        killmailJson: JSON.stringify(km),
        status: 'pending',
      }),
    );
  }

  /** killmail 损失估值：合计击杀条目价值 */
  private async estimateLossValue(km: any): Promise<number> {
    const items = km.victim?.items || [];
    let total = 0;
    for (const it of items) {
      if (it.flag === 5) continue; // 货柜/无人机舱略
      const unit = await this.marketPrice(it.item_type_id);
      total += (unit || 0) * (it.quantity_destroyed || 0);
    }
    return total;
  }

  private async matchRule(orgId: number, shipTypeId: number) {
    const all = await this.rules.find({ where: { orgId, enabled: true } });
    return all.find((r) => r.shipType === String(shipTypeId)) || all.find((r) => r.shipType === 'all');
  }

  listClaims(query: { orgId?: number; status?: string; page?: number; pageSize?: number }) {
    const qb = this.claims.createQueryBuilder('c').orderBy('c.createdAt', 'DESC');
    if (query.orgId) qb.andWhere('c.orgId = :o', { o: query.orgId });
    if (query.status) qb.andWhere('c.status = :s', { s: query.status });
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    qb.skip((page - 1) * pageSize).take(pageSize);
    return qb.getManyAndCount().then(([items, total]) => ({ items, total, page, pageSize }));
  }

  async review(id: number, reviewer: User, approve: boolean, reason?: string) {
    const c = await this.claims.findOne({ where: { id } });
    if (!c) throw new NotFoundException('报销单不存在');
    if (c.status !== 'pending') throw new Error('该单已处理');
    c.status = approve ? 'approved' : 'rejected';
    c.reviewer = reviewer;
    if (!approve) c.rejectReason = reason || '';
    const saved = await this.claims.save(c);
    if (approve) {
      try {
        await this.notify.push({
          title: 'SRP 报销已通过审核',
          body: `您的 ${c.shipName || '舰船'} 损失报销已通过，金额 ${c.payout.toLocaleString()} ISK，等待打款。`,
          channel: 'inapp',
          userId: c.characterId || undefined,
          event: 'srp',
          meta: { claimId: id },
        });
      } catch {}
    }
    return saved;
  }

  async markPaid(id: number, ref?: string) {
    const c = await this.claims.findOne({ where: { id } });
    if (!c) throw new NotFoundException('报销单不存在');
    c.status = 'paid';
    c.payoutRef = ref || '';
    const saved = await this.claims.save(c);
    try {
      await this.notify.push({
        title: 'SRP 报销已打款',
        body: `您的 ${c.shipName || '舰船'} 损失报销 ${c.payout.toLocaleString()} ISK 已打款${ref ? `，流水号 ${ref}` : ''}。`,
        channel: 'inapp',
        event: 'srp',
        meta: { claimId: id },
      });
    } catch {}
    return saved;
  }

  /** 月度 SRP 支出统计 */
  monthlyStats(orgId: number) {
    return this.claims
      .createQueryBuilder('c')
      .select(`strftime('%Y-%m', c.createdAt)`, 'ym')
      .addSelect('SUM(CASE WHEN c.status = "paid" OR c.status = "approved" THEN c.payout ELSE 0 END)', 'spent')
      .addSelect('COUNT(CASE WHEN c.status = "paid" THEN 1 END)', 'paidCount')
      .where('c.orgId = :o', { o: orgId })
      .groupBy(`strftime('%Y-%m', c.createdAt)`)
      .orderBy('ym', 'DESC')
      .getRawMany();
  }
}
