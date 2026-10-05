import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { Structure } from '../common/entities/structure.entity';
import { Organization } from '../common/entities/organization.entity';
import { StructureAlertService } from './structure-alert.service';

export interface StructureQuery {
  corporationId?: number;
  allianceId?: number;
  systemId?: number;
  typeId?: number;
  state?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

/** 建筑归属过滤：军团与联盟二选一（联盟建筑无 corporationId） */
export type StructureFilter = { corporationId?: number; allianceId?: number };

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
    return this.upsertStructures({ corporationId }, raw);
  }

  /** 保存某联盟的全部建筑（upsert，无权限 ACL） */
  async saveAllianceStructures(allianceId: number, raw: any[]): Promise<number> {
    return this.upsertStructures({ allianceId }, raw);
  }

  /**
   * 统一 upsert：按归属（军团/联盟）写入建筑并删除已下线项。
   * 军团端点字段较全（state/fuel/services/acl），联盟端点仅有
   * reinforcing_time / vulnerable_*，其余字段留空（ESI 不提供）。
   */
  private async upsertStructures(owner: StructureFilter, raw: any[]): Promise<number> {
    if (!raw?.length) return 0;
    const where = owner.corporationId != null ? { corporationId: owner.corporationId } : { allianceId: owner.allianceId };
    const existing = await this.repo.find({ where });
    const byId = new Map(existing.map((e) => [e.id, e]));
    const isAlliance = owner.allianceId != null;
    for (const s of raw) {
      const id = String(s.structure_id);
      const prev = byId.get(id);
      const aclHash = aclToHash(s.acl);
      const entity = prev || this.repo.create({ id, ...owner });
      entity.corporationId = owner.corporationId ?? null;
      entity.allianceId = owner.allianceId ?? null;
      entity.typeId = s.type_id;
      entity.systemId = s.system_id ?? null;
      entity.profileId = s.profile_id ?? null;
      // 联盟端点字段缺失时用 null（vulnerable_* 优先取联盟端点字段）
      entity.state = s.state ?? null;
      entity.fuelExpiresHours = s.fuel_expires_hours ?? null;
      entity.nextVulnerableStart = s.next_vulnerable_window_start ?? s.vulnerable_start_time ?? null;
      entity.nextVulnerableEnd = s.next_vulnerable_window_end ?? s.vulnerable_end_time ?? null;
      entity.reinforcingTime = s.reinforcing_time ?? null;
      entity.services = s.services ? JSON.stringify(s.services) : null;
      entity.isCitadel = [35832, 35833, 35834].includes(s.type_id);
      entity.aclHash = aclHash;
      await this.repo.save(entity);
      // 权限变更（仅军团端点提供 acl）：已有记录且摘要不同 -> 生成告警
      if (!isAlliance && prev && prev.aclHash && aclHash && prev.aclHash !== aclHash) {
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

  /** 由过滤条件构造 TypeORM where（军团/联盟二选一） */
  private whereFor(filter: StructureFilter) {
    if (filter.corporationId != null) return { corporationId: filter.corporationId };
    if (filter.allianceId != null) return { allianceId: filter.allianceId };
    return {};
  }

  /** 批量解析星系/类型名称（由调用方填充，避免循环依赖） */
  async resolveNames(filter: StructureFilter, resolve: (ids: number[]) => Promise<Record<number, { name: string }>>) {
    const list = await this.repo.find({ where: this.whereFor(filter) });
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

  /**
   * 回填星域/星座信息：由调用方把 systemId 解析为
   * { constellationId, regionId, regionName }（ESI 系统→星座→星域链路）。
   * 军团/联盟建筑通用。
   */
  async enrichLocations(
    filter: StructureFilter,
    resolve: (systemIds: number[]) => Promise<Record<number, { constellationId: number; regionId: number; regionName: string }>>,
  ) {
    const list = await this.repo.find({ where: this.whereFor(filter) });
    const systemIds = [...new Set(list.map((s) => s.systemId).filter(Boolean))] as number[];
    if (!systemIds.length) return;
    const map = await resolve(systemIds);
    let changed = false;
    for (const s of list) {
      const info = s.systemId != null ? map[s.systemId] : undefined;
      if (info) {
        s.constellationId = info.constellationId ?? s.constellationId;
        s.regionId = info.regionId ?? s.regionId;
        s.regionName = info.regionName ?? s.regionName;
        changed = true;
      }
    }
    if (changed) await this.repo.save(list);
  }

  async list(query: StructureQuery) {
    const page = query.page || 1;
    const pageSize = Math.min(query.pageSize || 50, 200);
    const where = this.repo.createQueryBuilder('s');
    if (query.corporationId) where.andWhere('s.corporationId = :cid', { cid: query.corporationId });
    if (query.allianceId) where.andWhere('s.allianceId = :aid', { aid: query.allianceId });
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

  /** 按军团/联盟统计：总数、按状态、按星系、按类型 */
  async stats(corporationId?: number, allianceId?: number) {
    const where =
      corporationId != null ? { corporationId } : allianceId != null ? { allianceId } : {};
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
