import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense, ExpenseStatus } from './expense.entity';
import { Payout } from './payout.entity';
import { TaxRecord } from '../common/entities/tax-record.entity';
import { Membership } from '../common/entities/membership.entity';
import { User } from '../common/entities/user.entity';

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(Expense) private readonly expenses: Repository<Expense>,
    @InjectRepository(Payout) private readonly payouts: Repository<Payout>,
    @InjectRepository(TaxRecord) private readonly taxRecords: Repository<TaxRecord>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
  ) {}

  // ---------- 支出审批流 ----------
  apply(dto: { orgId: number; orgType: string; title: string; amount: number; currency?: string; category?: string; payee?: string; description?: string }, applicant: User) {
    return this.expenses.save(this.expenses.create({ ...dto, currency: dto.currency || 'ISK', status: 'pending', applicant }));
  }

  listExpenses(query: { orgId?: number; status?: string; page?: number; pageSize?: number }) {
    const qb = this.expenses.createQueryBuilder('e').orderBy('e.createdAt', 'DESC').leftJoinAndSelect('e.applicant', 'ap').leftJoinAndSelect('e.reviewer', 'rv');
    if (query.orgId) qb.andWhere('e.orgId = :o', { o: query.orgId });
    if (query.status) qb.andWhere('e.status = :s', { s: query.status });
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    qb.skip((page - 1) * pageSize).take(pageSize);
    return qb.getManyAndCount().then(([items, total]) => ({ items, total, page, pageSize }));
  }

  async review(id: number, reviewer: User, approve: boolean, note?: string) {
    const e = await this.expenses.findOne({ where: { id } });
    if (!e) throw new NotFoundException('申请不存在');
    if (e.status !== 'pending') throw new Error('该申请已处理');
    e.status = approve ? 'approved' : 'rejected';
    e.reviewer = reviewer;
    e.reviewNote = note || '';
    return this.expenses.save(e);
  }

  async payout(id: number, ref?: string) {
    const e = await this.expenses.findOne({ where: { id } });
    if (!e) throw new NotFoundException('申请不存在');
    if (e.status !== 'approved') throw new Error('仅已审核通过可申请打款');
    e.status = 'paid';
    e.payoutRef = ref || '';
    return this.expenses.save(e);
  }

  // ---------- 分红 / 贡献度 ----------
  /** 计算分红：按周期内军税贡献比例分配奖金池 */
  async computePayout(orgId: number, period: string, pool: number, basis = 'tax-ratio') {
    const [year, month] = period.split('-').map(Number);
    const bills = await this.taxRecords.find({ where: { orgId, year, month } });
    const members = await this.memberships.find({ where: { orgId, isActive: true } });
    let detail: Array<{ characterId: number; characterName: string; amount: number; weight: number }> = [];
    if (basis === 'tax-ratio') {
      const totalTax = bills.reduce((s, b) => s + (b.amount || 0), 0) || 1;
      const map: Record<number, number> = {};
      bills.forEach((b) => (map[b.characterId] = (map[b.characterId] || 0) + b.amount));
      detail = Object.entries(map).map(([cid, tax]) => {
        const m = members.find((x) => x.characterId === +cid);
        return { characterId: +cid, characterName: m?.characterName || `角色#${cid}`, amount: Math.round((tax / totalTax) * pool), weight: tax / totalTax };
      });
    } else if (basis === 'equal') {
      const each = Math.round(pool / (members.length || 1));
      detail = members.map((m) => ({ characterId: m.characterId, characterName: m.characterName, amount: each, weight: 1 / (members.length || 1) }));
    } else if (basis === 'sp') {
      const totalSp = members.reduce((s, m) => s + (m.sp || 0), 0) || 1;
      detail = members.map((m) => ({ characterId: m.characterId, characterName: m.characterName, amount: Math.round(((m.sp || 0) / totalSp) * pool), weight: (m.sp || 0) / totalSp }));
    }
    const payout = await this.payouts.save(this.payouts.create({ orgId, orgType: 'corporation', period, pool, basis, detail: JSON.stringify(detail), status: 'draft' }));
    return payout;
  }

  listPayouts(orgId: number) {
    return this.payouts.find({ where: { orgId }, order: { id: 'DESC' } });
  }

  async finalizePayout(id: number, status: 'approved' | 'paid', note?: string) {
    const p = await this.payouts.findOne({ where: { id } });
    if (!p) throw new NotFoundException('分红记录不存在');
    p.status = status;
    if (note) p.note = note;
    return this.payouts.save(p);
  }
}
