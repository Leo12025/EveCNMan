import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssetLog } from './asset-log.entity';
import { MaterialNeed } from './material-need.entity';
import { Asset } from '../common/entities/asset.entity';

@Injectable()
export class AssetsService {
  constructor(
    @InjectRepository(Asset) private readonly assets: Repository<Asset>,
    @InjectRepository(AssetLog) private readonly logs: Repository<AssetLog>,
    @InjectRepository(MaterialNeed) private readonly needs: Repository<MaterialNeed>,
  ) {}

  // ---------- 资产盘点 ----------
  /** 资产列表（按 owner 过滤 + 搜索 + 分页） */
  async list(query: { ownerType?: string; ownerId?: number; search?: string; page?: number; pageSize?: number }) {
    const qb = this.assets.createQueryBuilder('a').orderBy('a.estimatedValue', 'DESC');
    if (query.ownerType) qb.andWhere('a.ownerType = :t', { t: query.ownerType });
    if (query.ownerId) qb.andWhere('a.ownerId = :o', { o: query.ownerId });
    if (query.search) qb.andWhere('a.typeName LIKE :s', { s: `%${query.search}%` });
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize || 20));
    qb.skip((page - 1) * pageSize).take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  /** 汇总：总价值/条目数/种类/位置分布/物品 Top */
  async summary(query: { ownerType?: string; ownerId?: number }) {
    const qb = this.assets.createQueryBuilder('a');
    if (query.ownerType) qb.andWhere('a.ownerType = :t', { t: query.ownerType });
    if (query.ownerId) qb.andWhere('a.ownerId = :o', { o: query.ownerId });

    const total = await qb.clone().getCount();
    const valueRow = await qb
      .clone()
      .select('COALESCE(SUM(a.estimatedValue),0)', 'v')
      .getRawOne();
    const totalValue = Number(valueRow?.v || 0);
    const typeCount = await qb.clone().select('COUNT(DISTINCT a.typeId)', 'c').getRawOne();
    const byLocation = await qb
      .clone()
      .select("COALESCE(a.locationName, '未知')", 'location')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(a.estimatedValue)', 'value')
      .groupBy('a.locationName')
      .orderBy('value', 'DESC')
      .getRawMany();
    const byType = await qb
      .clone()
      .select('a.typeName', 'type')
      .addSelect('SUM(a.quantity)', 'quantity')
      .addSelect('SUM(a.estimatedValue)', 'value')
      .groupBy('a.typeName')
      .orderBy('value', 'DESC')
      .limit(10)
      .getRawMany();

    return {
      totalValue,
      count: total,
      typeCount: Number(typeCount?.c || 0),
      byLocation: byLocation.map((r) => ({ location: r.location, count: Number(r.count), value: Number(r.value || 0) })),
      byType: byType.map((r) => ({ type: r.type, quantity: Number(r.quantity || 0), value: Number(r.value || 0) })),
    };
  }

  /** 蓝图库：BPO/BPC 清单 */
  blueprints(query: { ownerType?: string; ownerId?: number; search?: string }) {
    const qb = this.assets.createQueryBuilder('a').where('a.isBlueprint = :b', { b: true }).orderBy('a.typeName', 'ASC');
    if (query.ownerType) qb.andWhere('a.ownerType = :t', { t: query.ownerType });
    if (query.ownerId) qb.andWhere('a.ownerId = :o', { o: query.ownerId });
    if (query.search) qb.andWhere('a.typeName LIKE :s', { s: `%${query.search}%` });
    return qb.getMany();
  }

  // ---------- 资产变动流水 ----------
  logTake(dto: { orgType: string; orgId: number; itemId: number; typeId: number; typeName?: string; quantity?: number; actorCharacterId?: number; actorName?: string; toLocation?: string; note?: string }) {
    return this.logs.save(this.logs.create({ ...dto, quantity: dto.quantity ?? 1, action: 'take', source: 'manual' }));
  }

  listLogs(query: { orgId?: number; action?: string; page?: number; pageSize?: number }) {
    const qb = this.logs.createQueryBuilder('l').orderBy('l.createdAt', 'DESC');
    if (query.orgId) qb.andWhere('l.orgId = :o', { o: query.orgId });
    if (query.action) qb.andWhere('l.action = :a', { a: query.action });
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    qb.skip((page - 1) * pageSize).take(pageSize);
    return qb.getManyAndCount().then(([items, total]) => ({ items, total, page, pageSize }));
  }

  // ---------- 材料缺口 ----------
  upsertNeed(dto: { orgId: number; orgType: string; typeId: number; typeName?: string; target?: number; threshold?: number; source?: string }) {
    return this.needs.save(this.needs.create(dto));
  }

  listNeeds(orgId: number) {
    return this.needs.find({ where: { orgId } });
  }

  /** 计算缺口：对比当前库存与阈值，返回预警列表 */
  async gapReport(orgId: number) {
    const needs = await this.needs.find({ where: { orgId } });
    const ids = needs.map((n) => n.typeId);
    if (!ids.length) return [];
    const rows = await this.assets
      .createQueryBuilder('a')
      .select('a.typeId', 'typeId')
      .addSelect('SUM(a.quantity)', 'qty')
      .where('a.ownerType = :t AND a.ownerId = :o AND a.typeId IN (:...ids)', { t: 'corporation', o: orgId, ids })
      .groupBy('a.typeId')
      .getRawMany();
    const stock: Record<number, number> = {};
    rows.forEach((r) => (stock[r.typeId] = Number(r.qty)));
    return needs.map((n) => {
      const have = stock[n.typeId] || 0;
      return { typeId: n.typeId, typeName: n.typeName, target: n.target, threshold: n.threshold, have, gap: Math.max(0, n.target - have), shortage: have < n.threshold };
    });
  }

  removeNeed(id: number) {
    return this.needs.delete(id);
  }
}
