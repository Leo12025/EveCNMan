import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaxRecord } from '../common/entities/tax-record.entity';

export interface TaxQuery {
  orgId?: number;
  year?: number;
  month?: number;
  search?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class TaxesService {
  constructor(
    @InjectRepository(TaxRecord) private readonly taxes: Repository<TaxRecord>,
  ) {}

  async list(query: TaxQuery) {
    const qb = this.taxes.createQueryBuilder('t');
    if (query.orgId) qb.andWhere('t.orgId = :orgId', { orgId: query.orgId });
    if (query.year) qb.andWhere('t.year = :year', { year: query.year });
    if (query.month) qb.andWhere('t.month = :month', { month: query.month });
    if (query.search) qb.andWhere('t.characterName LIKE :s', { s: `%${query.search}%` });

    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize || 50));
    qb.orderBy('t.amount', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  /** 月度汇总：按组织×年月 */
  async monthlySummary(orgId?: number) {
    const qb = this.taxes.createQueryBuilder('t')
      .select('t.orgId', 'orgId')
      .addSelect('t.orgName', 'orgName')
      .addSelect('t.year', 'year')
      .addSelect('t.month', 'month')
      .addSelect('SUM(t.amount)', 'total')
      .addSelect('COUNT(DISTINCT t.characterId)', 'payers');
    if (orgId) qb.where('t.orgId = :orgId', { orgId });
    qb.groupBy('t.orgId').addGroupBy('t.orgName').addGroupBy('t.year').addGroupBy('t.month')
      .orderBy('t.year', 'DESC').addOrderBy('t.month', 'DESC').addOrderBy('total', 'DESC');
    const rows = await qb.getRawMany();
    return rows.map((r) => ({
      orgId: Number(r.orgId),
      orgName: r.orgName,
      year: Number(r.year),
      month: Number(r.month),
      total: Number(r.total || 0),
      payers: Number(r.payers || 0),
    }));
  }

  /** 成员税收排行（当月） */
  async memberRanking(limit = 20) {
    const rows = await this.taxes.createQueryBuilder('t')
      .select('t.characterId', 'characterId')
      .addSelect('t.characterName', 'characterName')
      .addSelect('SUM(t.amount)', 'total')
      .groupBy('t.characterId')
      .addGroupBy('t.characterName')
      .orderBy('total', 'DESC')
      .limit(limit)
      .getRawMany();
    return rows.map((r, i) => ({
      rank: i + 1,
      characterId: Number(r.characterId),
      characterName: r.characterName,
      total: Number(r.total || 0),
    }));
  }

  /** 近 N 月各组织税收趋势 */
  async trend(months = 6) {
    const rows = await this.taxes.createQueryBuilder('t')
      .select('t.orgName', 'orgName')
      .addSelect('t.year', 'year')
      .addSelect('t.month', 'month')
      .addSelect('SUM(t.amount)', 'total')
      .groupBy('t.orgName')
      .addGroupBy('t.year')
      .addGroupBy('t.month')
      .orderBy('t.year', 'ASC')
      .addOrderBy('t.month', 'ASC')
      .getRawMany();

    const now = new Date();
    const keys: string[] = [];
    for (let back = months - 1; back >= 0; back--) {
      const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
      keys.push(`${d.getFullYear()}-${d.getMonth() + 1}`);
    }
    const byKey: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      const key = `${r.year}-${r.month}`;
      if (!keys.includes(key)) continue;
      byKey[key] = byKey[key] || {};
      byKey[key][r.orgName] = Number(r.total || 0);
    }
    const orgs = [...new Set(rows.map((r) => r.orgName))];
    return {
      months: keys.map((k) => {
        const [y, m] = k.split('-');
        return `${y}/${m}`;
      }),
      series: orgs.map((name) => ({
        name,
        data: keys.map((k) => byKey[k]?.[name] || 0),
      })),
    };
  }

  async importRecord(dto: { orgId: number; orgName: string; characterId: number; characterName: string; year: number; month: number; amount: number; note?: string }) {
    const existing = await this.taxes.findOne({
      where: {
        orgId: dto.orgId,
        characterId: dto.characterId,
        year: dto.year,
        month: dto.month,
      },
    });
    if (existing) {
      existing.amount = dto.amount;
      existing.note = dto.note ?? existing.note;
      return this.taxes.save(existing);
    }
    return this.taxes.save(
      this.taxes.create(dto),
    );
  }
}
