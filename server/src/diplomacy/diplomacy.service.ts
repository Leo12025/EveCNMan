import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Diplomacy, DiploRelation } from './diplomacy.entity';
import { Transfer, TransferStatus } from './transfer.entity';

@Injectable()
export class DiplomacyService {
  constructor(
    @InjectRepository(Diplomacy) private readonly diplo: Repository<Diplomacy>,
    @InjectRepository(Transfer) private readonly transfers: Repository<Transfer>,
  ) {}

  // ---------- 外交关系 ----------
  list(orgId: number) {
    return this.diplo.find({ where: { orgId } });
  }

  upsert(dto: { orgId: number; orgType?: string; targetId: number; targetName?: string; relation?: DiploRelation; standing?: number; note?: string }) {
    return this.diplo.save(this.diplo.create({ ...dto, orgType: dto.orgType || 'corporation', relation: dto.relation || 'neutral', standing: dto.standing ?? 0 }));
  }

  remove(id: number) {
    return this.diplo.delete(id);
  }

  /** 按名单关系获取（蓝/红名单） */
  relationList(orgId: number, relation: DiploRelation) {
    return this.diplo.find({ where: { orgId, relation } });
  }

  // ---------- 转会 ----------
  createTransfer(dto: Partial<Transfer>) {
    return this.transfers.save(this.transfers.create({ ...dto, status: dto.status || 'requested' }));
  }

  listTransfers(status?: string) {
    const qb = this.transfers.createQueryBuilder('t').orderBy('t.createdAt', 'DESC');
    if (status) qb.andWhere('t.status = :s', { s: status });
    return qb.getMany();
  }

  async reviewTransfer(id: number, approve: boolean, note?: string) {
    const t = await this.transfers.findOne({ where: { id } });
    if (!t) throw new NotFoundException('转会申请不存在');
    if (t.status !== 'requested') throw new Error('该申请已处理');
    t.status = approve ? ('approved' as TransferStatus) : ('rejected' as TransferStatus);
    if (note) t.note = note;
    return this.transfers.save(t);
  }

  async completeTransfer(id: number) {
    const t = await this.transfers.findOne({ where: { id } });
    if (!t) throw new NotFoundException('转会申请不存在');
    t.status = 'done';
    return this.transfers.save(t);
  }
}
