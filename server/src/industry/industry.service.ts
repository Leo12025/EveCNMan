import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IndustryJob, JobStatus } from './job.entity';
import { MiningLedger } from './mining-ledger.entity';

@Injectable()
export class IndustryService {
  constructor(
    @InjectRepository(IndustryJob) private readonly jobs: Repository<IndustryJob>,
    @InjectRepository(MiningLedger) private readonly ledgers: Repository<MiningLedger>,
  ) {}

  // ---------- 工作单 ----------
  createJob(dto: Partial<IndustryJob>) {
    return this.jobs.save(this.jobs.create({ ...dto, status: dto.status || 'planned', materials: dto.materials || '[]' }));
  }

  listJobs(query: { orgId?: number; status?: string }) {
    const qb = this.jobs.createQueryBuilder('j').orderBy('j.createdAt', 'DESC');
    if (query.orgId) qb.andWhere('j.orgId = :o', { o: query.orgId });
    if (query.status) qb.andWhere('j.status = :s', { s: query.status });
    return qb.getMany();
  }

  async updateJob(id: number, patch: Partial<IndustryJob>) {
    const j = await this.jobs.findOne({ where: { id } });
    if (!j) throw new Error('工作单不存在');
    Object.assign(j, patch);
    if (patch.status === 'in_progress' && !j.startedAt) j.startedAt = new Date();
    if (patch.status === 'done' || patch.status === 'delivered') j.finishedAt = new Date();
    return this.jobs.save(j);
  }

  /** 工业链成本核算汇总 */
  costSummary(orgId: number) {
    return this.jobs
      .createQueryBuilder('j')
      .select('j.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(j.cost)', 'cost')
      .where('j.orgId = :o', { o: orgId })
      .groupBy('j.status')
      .getRawMany();
  }

  // ---------- 矿队产量 ----------
  upsertLedger(dto: { orgId: number; characterId: number; characterName?: string; period: string; typeId: number; typeName?: string; quantity: number; value?: number }) {
    return this.ledgers.save(this.ledgers.create(dto));
  }

  listLedgers(query: { orgId?: number; period?: string; characterId?: number }) {
    const qb = this.ledgers.createQueryBuilder('l').orderBy('l.quantity', 'DESC');
    if (query.orgId) qb.andWhere('l.orgId = :o', { o: query.orgId });
    if (query.period) qb.andWhere('l.period = :p', { p: query.period });
    if (query.characterId) qb.andWhere('l.characterId = :c', { c: query.characterId });
    return qb.getMany();
  }

  /** 产量报表：按角色/矿石聚合 */
  async miningReport(orgId: number, period: string) {
    const rows = await this.ledgers
      .createQueryBuilder('l')
      .select('l.characterId', 'characterId')
      .addSelect('l.characterName', 'characterName')
      .addSelect('SUM(l.quantity)', 'quantity')
      .addSelect('SUM(l.value)', 'value')
      .where('l.orgId = :o AND l.period = :p', { o: orgId, p: period })
      .groupBy('l.characterId, l.characterName')
      .getRawMany();
    const totals = await this.ledgers
      .createQueryBuilder('l')
      .select('l.typeId', 'typeId')
      .addSelect('l.typeName', 'typeName')
      .addSelect('SUM(l.quantity)', 'quantity')
      .addSelect('SUM(l.value)', 'value')
      .where('l.orgId = :o AND l.period = :p', { o: orgId, p: period })
      .groupBy('l.typeId, l.typeName')
      .getRawMany();
    return { byCharacter: rows, byOre: totals, totalValue: rows.reduce((s, r) => s + Number(r.value || 0), 0) };
  }
}
