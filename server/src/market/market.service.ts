import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarketOrder, OrderState } from './order.entity';
import { PriceWatch } from './price-watch.entity';
import { PriceHistory } from './price-history.entity';
import { EsiService } from '../esi/esi.service';

@Injectable()
export class MarketService {
  constructor(
    @InjectRepository(MarketOrder) private readonly orders: Repository<MarketOrder>,
    @InjectRepository(PriceWatch) private readonly watches: Repository<PriceWatch>,
    @InjectRepository(PriceHistory) private readonly history: Repository<PriceHistory>,
    private readonly esi: EsiService,
  ) {}

  createOrder(dto: Partial<MarketOrder>) {
    return this.orders.save(this.orders.create({ ...dto, state: dto.state || 'open' }));
  }

  listOrders(query: { orgId?: number; side?: string; state?: string }) {
    const qb = this.orders.createQueryBuilder('o').orderBy('o.createdAt', 'DESC');
    if (query.orgId) qb.andWhere('o.orgId = :o', { o: query.orgId });
    if (query.side) qb.andWhere('o.side = :s', { s: query.side });
    if (query.state) qb.andWhere('o.state = :st', { st: query.state });
    return qb.getMany();
  }

  async cancelOrder(id: number) {
    return this.orders.update(id, { state: 'cancelled' });
  }

  /** 设置价格监控目标 */
  watch(dto: Partial<PriceWatch>) {
    return this.watches.save(this.watches.create(dto));
  }

  listWatches(typeId?: number) {
    const qb = this.watches.createQueryBuilder('w');
    if (typeId) qb.andWhere('w.typeId = :t', { t: typeId });
    return qb.getMany();
  }

  /** 多区域比价：从 ESI 拉取指定物品在各区域的最新价 */
  async compare(typeId: number, regionIds: number[]) {
    const results: Array<{ regionId: number; buy: number; sell: number; volume: number }> = [];
    for (const regionId of regionIds) {
      try {
        const orders = await this.esi.getMarketOrders(regionId, typeId);
        let buy = 0, sell = Infinity, volume = 0;
        for (const o of orders || []) {
          volume += o.volume_remain || 0;
          if (o.is_buy_order) buy = Math.max(buy, o.price);
          else sell = Math.min(sell, o.price);
        }
        results.push({ regionId, buy, sell: sell === Infinity ? 0 : sell, volume });
      } catch {
        results.push({ regionId, buy: 0, sell: 0, volume: 0 });
      }
    }
    return results;
  }

  /** 价格走势：拉取 ESI 历史并缓存到 price_history，返回按日期排序序列 */
  async historyTrend(regionId: number, typeId: number, typeName = '', days = 30) {
    const now = Date.now();
    const since = now - days * 24 * 3600_000;
    const cached = await this.history.findOne({
      where: { regionId, typeId },
      order: { generatedAt: 'DESC' },
    });
    // 3 小时内已有缓存则直接返回
    if (cached && now - Number(cached.generatedAt) < 3 * 3600_000) {
      return this.fetchSeries(regionId, typeId);
    }
    let raw: any[] = [];
    try {
      raw = await this.esi.getMarketHistory(regionId, typeId);
    } catch {
      return this.fetchSeries(regionId, typeId);
    }
    const rows = (raw || []).filter((r) => r.date && new Date(r.date).getTime() >= since);
    for (const r of rows) {
      const date = (r.date || '').slice(0, 10);
      const existing = await this.history.findOne({ where: { regionId, typeId, date } });
      const avg = Number(r.average ?? 0);
      const highest = Number(r.highest ?? 0);
      const lowest = Number(r.lowest ?? 0);
      const volume = Number(r.volume ?? 0);
      if (existing) {
        Object.assign(existing, { avgPrice: avg, highest, lowest, volume, generatedAt: now });
        await this.history.save(existing);
      } else {
        await this.history.save(
          this.history.create({ regionId, typeId, typeName, date, avgPrice: avg, highest, lowest, volume, generatedAt: now }),
        );
      }
    }
    return this.fetchSeries(regionId, typeId);
  }

  private async fetchSeries(regionId: number, typeId: number) {
    const rows = await this.history
      .createQueryBuilder('h')
      .where('h.regionId = :r AND h.typeId = :t', { r: regionId, t: typeId })
      .orderBy('h.date', 'ASC')
      .getMany();
    return rows.map((r) => ({
      date: r.date,
      avgPrice: r.avgPrice,
      highest: r.highest,
      lowest: r.lowest,
      volume: r.volume,
    }));
  }
}
