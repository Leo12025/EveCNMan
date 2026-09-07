import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletBalance } from '../common/entities/wallet-balance.entity';
import { WalletJournal } from '../common/entities/wallet-journal.entity';
import { Organization } from '../common/entities/organization.entity';

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(WalletBalance) private readonly balances: Repository<WalletBalance>,
    @InjectRepository(WalletJournal) private readonly journalRepo: Repository<WalletJournal>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
  ) {}

  /** 军团钱包结算：各分部余额 + 汇总 + 近 6 个月军税流入 */
  async corporationSettle(orgId: number) {
    const org = await this.orgs.findOne({ where: { id: orgId } });
    if (!org) return null;

    const balances = await this.balances.find({ where: { ownerType: 'corporation', ownerId: orgId }, order: { division: 'ASC' } });
    const total = balances.reduce((s, b) => s + (b.balance || 0), 0);

    const taxInflow: Array<{ ym: string; total: number }> = await this.journalRepo
      .createQueryBuilder('j')
      .select(`strftime('%Y-%m', j.date)`, 'ym')
      .addSelect('SUM(j.amount)', 'total')
      .where('j.ownerType = :t AND j.ownerId = :orgId AND j.refType IN (:...types) AND j.amount > 0', {
        t: 'corporation',
        orgId,
        types: ['player_tax', 'player_donation'],
      })
      .groupBy(`strftime('%Y-%m', j.date)`)
      .orderBy('ym', 'DESC')
      .limit(6)
      .getRawMany();

    return {
      orgId,
      orgName: org.name,
      balances,
      total,
      taxInflow,
    };
  }

  /** 钱包日志分页查询 */
  async journals(opts: { orgId?: number; ownerType?: 'corporation' | 'character'; refType?: string; page?: number; pageSize?: number; search?: string }) {
    const page = opts.page || 1;
    const pageSize = Math.min(opts.pageSize || 20, 100);
    const qb = this.journalRepo.createQueryBuilder('j').orderBy('j.date', 'DESC');
    if (opts.ownerType) qb.andWhere('j.ownerType = :t', { t: opts.ownerType });
    if (opts.orgId) qb.andWhere('j.ownerId = :orgId', { orgId: opts.orgId });
    if (opts.refType) qb.andWhere('j.refType = :refType', { refType: opts.refType });
    if (opts.search) qb.andWhere('j.characterName LIKE :s', { s: `%${opts.search}%` });

    const [items, total] = await qb.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    return { items, total };
  }

  /** 常见交易类型（用于筛选下拉） */
  refTypes() {
    return this.journalRepo
      .createQueryBuilder('j')
      .select('j.refType', 'refType')
      .addSelect('COUNT(*)', 'count')
      .groupBy('j.refType')
      .orderBy('count', 'DESC')
      .getRawMany();
  }
}
