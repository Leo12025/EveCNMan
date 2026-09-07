import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { Structure } from '../common/entities/structure.entity';
import { Organization } from '../common/entities/organization.entity';
import { StructureAlertService } from './structure-alert.service';

export interface StructureQuery {
  corporationId?: number;
  systemId?: number;
  typeId?: number;
  state?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

/** 由 ESI 结构 ACL（角色权限映射）计算稳定摘要，用于变更检测 */
function aclToHash(acl: any): string | null {
  if (!acl || typeof acl !== 'object') return null;
  const norm = Object.keys(acl)
    .sort()
    .map((k) => `${k}:${JSON.stringify(acl[k])}`)
    .join('|');
  return createHash('sha1').update(norm).digest('hex').slice(0, 16);
}

@Injectable()
export class StructuresService {
  private readonly logger = new Logger(StructuresService.name);

  constructor(
    @InjectRepository(Structure) private readonly repo: Repository<Structure>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    private readonly alertSvc: StructureAlertService,
  ) {}

  /** 保存某军团的全部建筑（upsert + 权限变更检测） */
  async saveStructures(corporationId: number, raw: any[]): Promise<number> {
    if (!raw?.length) return 0;
    const existing = await this.repo.find({ where: { corporationId } });
    const byId = new Map(existing.map((e) => [e.id, e]));
    for (const s of raw) {
      const id = String(s.structure_id);
      const prev = byId.get(id);
      const aclHash = aclToHash(s.acl);
      const entity = prev || this.repo.create({ id, corporationId });
      entity.corporationId = corporationId;
      entity.typeId = s.type_id;
      entity.systemId = s.system_id ?? null;
      entity.profileId = s.profile_id ?? null;
      entity.state = s.state ?? null;
      entity.fuelExpiresHours = s.fuel_expires_hours ?? null;
      entity.nextVulnerableStart = s.next_vulnerable_window_start ?? null;
      entity.nextVulnerableEnd = s.next_vulnerable_window_end ?? null;
      entity.services = s.services ? JSON.stringify(s.services) : null;
      entity.isCitadel = [35832, 35833, 35834].includes(s.type_id);
      entity.aclHash = aclHash;
      await this.repo.save(entity);
      // 权限变更：已有记录且摘要不同 -> 生成告警
      if (prev && prev.aclHash && aclHash && prev.aclHash !== aclHash) {
        try {
          await this.alertSvc.create(
            id,
            'permission-change',
            '结构权限已变更',
            `建筑 ${s.type_id} (${id}) 的访问权限配置发生变化，请核实是否授权合规。`,
          );
        } catch (e) {
          this.logger.warn(`结构权限变更告警失败 ${id}: ${(e as Error).message}`);
        }
      }
    }
    // 删除已不存在的结构
    const incomingIds = new Set(raw.map((s) => String(s.structure_id)));
    for (const e of existing) {
      if (!incomingIds.has(e.id)) await this.repo.delete({ id: e.id });
    }
    return raw.length;
  }

  /** 批量解析星系/类型名称（由调用方填充，避免循环依赖） */
  async resolveNames(corporationId: number, resolve: (ids: number[]) => Promise<Record<number, { name: string }>>) {
    const list = await this.repo.find({ where: { corporationId } });
    const systemIds = [...new Set(list.map((s) => s.systemId).filter(Boolean))] as number[];
    const typeIds = [...new Set(list.map((s) => s.typeId).filter(Boolean))] as number[];
    const [systems, types] = await Promise.all([
      systemIds.length ? resolve(systemIds) : Promise.resolve({} as Record<number, { name: string }>),
      typeIds.length ? resolve(typeIds) : Promise.resolve({} as Record<number, { name: string }>),
    ]);
    for (const s of list) {
      s.systemName = systems[s.systemId]?.name || s.systemName;
      s.typeName = types[s.typeId]?.name || s.typeName;
    }
    await this.repo.save(list);
  }

  async list(query: StructureQuery) {
    const page = query.page || 1;
    const pageSize = Math.min(query.pageSize || 50, 200);
    const where = this.repo.createQueryBuilder('s');
    if (query.corporationId) where.andWhere('s.corporationId = :cid', { cid: query.corporationId });
    if (query.systemId) where.andWhere('s.systemId = :sid', { sid: query.systemId });
    if (query.typeId) where.andWhere('s.typeId = :tid', { tid: query.typeId });
    if (query.state) where.andWhere('s.state = :state', { state: query.state });
    if (query.search) {
      where.andWhere(
        new Brackets((q) => {
          q.where('s.typeName LIKE :s', { s: `%${query.search}%` })
            .orWhere('s.systemName LIKE :s', { s: `%${query.search}%` })
            .orWhere('s.note LIKE :s', { s: `%${query.search}%` })
            .orWhere('s.id LIKE :s', { s: `%${query.search}%` });
        }),
      );
    }
    const [items, total] = await where.getManyAndCount();
    const sorted = items.sort((a, b) => Number(b.id) - Number(a.id));
    const slice = sorted.slice((page - 1) * pageSize, page * pageSize);
    return { items: slice, total, page, pageSize };
  }

  /** 按军团统计：总数、按状态、按星系、按类型 */
  async stats(corporationId?: number) {
    const where = corporationId ? { corporationId } : {};
    const all = await this.repo.find({ where });
    const byState: Record<string, number> = {};
    const bySystem: Record<string, { name: string; count: number }> = {};
    const byType: Record<string, { name: string; count: number }> = {};
    for (const s of all) {
      byState[s.state || 'unknown'] = (byState[s.state || 'unknown'] || 0) + 1;
      const sysKey = s.systemName || `sys ${s.systemId}`;
      bySystem[sysKey] = bySystem[sysKey] || { name: sysKey, count: 0 };
      bySystem[sysKey].count++;
      const typeKey = s.typeName || `type ${s.typeId}`;
      byType[typeKey] = byType[typeKey] || { name: typeKey, count: 0 };
      byType[typeKey].count++;
    }
    return {
      total: all.length,
      byState,
      bySystem: Object.values(bySystem).sort((a, b) => b.count - a.count),
      byType: Object.values(byType).sort((a, b) => b.count - a.count),
    };
  }

  async updateNote(id: string, note: string) {
    const s = await this.repo.findOne({ where: { id } });
    if (!s) return null;
    s.note = note;
    return this.repo.save(s);
  }

  /** 本地建筑展示名（建筑类型 @ 星系），未记录到该建筑时返回 null */
  async displayName(id: string): Promise<string | null> {
    const s = await this.repo.findOne({ where: { id } });
    if (!s) return null;
    const parts = [s.typeName, s.systemName].filter(Boolean);
    return parts.length ? parts.join(' @ ') : null;
  }
}
