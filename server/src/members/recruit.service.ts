import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Recruit } from './recruit.entity';
import { RecruitGate } from './recruit-gate.entity';
import { Membership } from '../common/entities/membership.entity';
import { CharacterSnapshot } from '../common/entities/character-snapshot.entity';
import { User } from '../common/entities/user.entity';

@Injectable()
export class RecruitService {
  constructor(
    @InjectRepository(Recruit) private readonly recruits: Repository<Recruit>,
    @InjectRepository(RecruitGate) private readonly gates: Repository<RecruitGate>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    @InjectRepository(CharacterSnapshot) private readonly snapshots: Repository<CharacterSnapshot>,
  ) {}

  // ---------- 门槛配置 ----------
  async getGate(orgId: number, orgType: string) {
    let gate = await this.gates.findOne({ where: { orgId, orgType } });
    if (!gate) {
      gate = await this.gates.save(
        this.gates.create({ orgId, orgType, minSp: 0, minSecurity: -10, requiredSkills: '[]', autoReject: false, enabled: true }),
      );
    }
    return gate;
  }

  async upsertGate(orgId: number, orgType: string, patch: Partial<RecruitGate>) {
    const gate = await this.getGate(orgId, orgType);
    Object.assign(gate, {
      minSp: patch.minSp ?? gate.minSp,
      minSecurity: patch.minSecurity ?? gate.minSecurity,
      requiredSkills: patch.requiredSkills ?? gate.requiredSkills,
      autoReject: patch.autoReject ?? gate.autoReject,
      enabled: patch.enabled ?? gate.enabled,
    });
    return this.gates.save(gate);
  }

  // ---------- 申请 ----------
  async list(query: { status?: string; orgId?: number; page?: number; pageSize?: number }) {
    const qb = this.recruits.createQueryBuilder('r');
    if (query.status) qb.andWhere('r.status = :s', { s: query.status });
    if (query.orgId) qb.andWhere('r.orgId = :o', { o: query.orgId });
    qb.orderBy('r.createdAt', 'DESC');
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize || 50));
    qb.skip((page - 1) * pageSize).take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  /** 提交申请：自动比对门槛（若角色已同步有快照） */
  async submit(dto: { characterName: string; characterId?: number; orgId: number; orgType?: string; reason?: string; contact?: string; source?: string }) {
    const orgType = dto.orgType || 'corporation';
    const recruit = this.recruits.create({
      characterName: dto.characterName,
      characterId: dto.characterId,
      orgId: dto.orgId,
      orgType,
      reason: dto.reason,
      contact: dto.contact,
      source: dto.source || 'form',
      status: 'pending',
    });
    const gate = await this.gates.findOne({ where: { orgId: dto.orgId, orgType } });
    if (gate?.enabled && dto.characterId) {
      const gateResult = await this.evaluateGate(dto.characterId, gate);
      recruit.gateResult = JSON.stringify(gateResult);
      if (gate.autoReject && !gateResult.passed) recruit.status = 'rejected';
    }
    return this.recruits.save(recruit);
  }

  /** 比对角色快照与门槛 */
  private async evaluateGate(characterId: number, gate: RecruitGate) {
    const snap = await this.snapshots.findOne({ where: { ownerType: 'character', ownerId: characterId } });
    const p = snap ? JSON.parse(snap.payload) : {};
    const required = JSON.parse(gate.requiredSkills || '[]');
    const hasSkills = Array.isArray(p.skillTypeIds) ? p.skillTypeIds : [];
    const missingSkills: number[] = [];
    for (const s of required) if (!hasSkills.includes(s)) missingSkills.push(s);
    const sp = p.totalSp ?? 0;
    const sec = p.securityStatus ?? -10;
    const passed = sp >= gate.minSp && sec >= gate.minSecurity && missingSkills.length === 0;
    return { passed, sp, minSp: gate.minSp, security: sec, minSecurity: gate.minSecurity, missingSkills };
  }

  /** 审核 */
  async review(id: number, reviewer: User, approve: boolean, note?: string) {
    const r = await this.recruits.findOne({ where: { id } });
    if (!r) throw new NotFoundException('申请不存在');
    if (r.status !== 'pending') throw new BadRequestException('该申请已处理');
    r.status = approve ? 'approved' : 'rejected';
    r.reviewer = reviewer;
    r.reviewNote = note || '';
    return this.recruits.save(r);
  }

  /** 审核通过后加团（建立 membership 记录）；可绑定到已有成员关系 */
  async join(id: number, characterId: number) {
    const r = await this.recruits.findOne({ where: { id } });
    if (!r) throw new NotFoundException('申请不存在');
    if (r.status !== 'approved') throw new BadRequestException('仅已通过审核的申请可加团');
    r.characterId = characterId;
    r.status = 'joined';
    // 建立/激活成员关系
    let m = await this.memberships.findOne({ where: { characterId, orgId: r.orgId } });
    if (!m) {
      m = await this.memberships.save(
        this.memberships.create({ characterId, orgType: r.orgType as any, orgId: r.orgId, characterName: r.characterName, isActive: true, joinedAt: new Date(), activityTier: 'active' }),
      );
    } else {
      m.isActive = true;
      m.leftAt = null;
      m.leaveReason = null;
      await this.memberships.save(m);
    }
    await this.recruits.save(r);
    return { ok: true, membershipId: m.id };
  }

  /** 踢出 / 离职 */
  async leave(characterId: number, orgId: number, reason?: string) {
    const m = await this.memberships.findOne({ where: { characterId, orgId } });
    if (!m) throw new NotFoundException('成员关系不存在');
    m.isActive = false;
    m.activityTier = 'left';
    m.leaveReason = reason || '';
    m.leftAt = new Date();
    await this.memberships.save(m);
    return { ok: true };
  }
}
