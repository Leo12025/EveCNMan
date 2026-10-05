import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EveAccount } from '../common/entities/eve-account.entity';
import { Organization, OrgType } from '../common/entities/organization.entity';
import { Membership } from '../common/entities/membership.entity';
import { Asset } from '../common/entities/asset.entity';
import { TaxRecord } from '../common/entities/tax-record.entity';
import { SyncLog } from '../common/entities/sync-log.entity';
import { WalletJournal } from '../common/entities/wallet-journal.entity';
import { WalletBalance } from '../common/entities/wallet-balance.entity';
import { CharacterSnapshot } from '../common/entities/character-snapshot.entity';
import { MembersService } from '../members/members.service';
import { EsiService } from './esi.service';
import { StructuresService } from '../structures/structures.service';
import { NotifyService } from '../notify/notify.service';
import { mockCorporationMembers, mockCorporationAssets, mockTaxRecords, mockCorporationStructures, mockStructureNames, mockSystemCosmic, mockAllianceStructures, CORPS, ALLIANCES } from './mock-data';

const TAX_REF_TYPES = ['player_tax', 'player_donation'];

/** 是否已存在真实 SSO 绑定的账号（决定是否可走真实 ESI；无则回退演示数据） */
/** 国服常见授权 scope */
export const ESI_SCOPES = {
  CHAR_WALLET: 'esi-wallet.read_character_wallet.v1',
  CHAR_SKILLS: 'esi-skills.read_skills.v1',
  CHAR_SKILLQUEUE: 'esi-skills.read_skillqueue.v1',
  CHAR_LOCATION: 'esi-location.read_location.v1',
  CHAR_ONLINE: 'esi-location.read_online.v1',
  CHAR_SHIP: 'esi-location.read_ship_type.v1',
  CHAR_ASSETS: 'esi-assets.read_assets.v1',
  CHAR_CLONES: 'esi-clones.read_clones.v1',
  CHAR_LOYALTY: 'esi-characters.read_loyalty.v1',
  CHAR_BLUEPRINTS: 'esi-characters.read_blueprints.v1',
  CHAR_INDUSTRY: 'esi-industry.read_character_jobs.v1',
  CHAR_CORP_ROLES: 'esi-characters.read_corporation_roles.v1',
  CHAR_CONTACTS: 'esi-characters.read_contacts.v1',
  CORP_MEMBERS: 'esi-corporations.read_corporation_membership.v1',
  CORP_TRACKING: 'esi-corporations.track_members.v1',
  CORP_ROLES: 'esi-corporations.read_corporation_roles.v1',
  CORP_WALLETS: 'esi-wallet.read_corporation_wallets.v1',
  CORP_ASSETS: 'esi-assets.read_corporation_assets.v1',
  CORP_BLUEPRINTS: 'esi-corporations.read_corporation_blueprints.v1',
  CORP_STRUCTURES: 'esi-corporations.read_structures.v1',
  CORP_DIVISIONS: 'esi-corporations.read_divisions.v1',
  CORP_INDUSTRY: 'esi-industry.read_corporation_jobs.v1',
  CORP_CONTACTS: 'esi-corporations.read_contacts.v1',
  ALLIANCE_CONTACTS: 'esi-alliances.read_contacts.v1',
  ALLIANCE_STRUCTURES: 'esi-alliances.read_structures.v1',
};

/** 网易 ESI 的军团描述偶以 Python repr 文本（如 u'...\u8fd9...'）存储，这里还原成可读文本 */
function decodeCorpDescription(raw?: string | null): string | null {
  if (raw == null) return null;
  let s = raw;
  if (s.startsWith("u'") && s.endsWith("'")) s = s.slice(2, -1);
  else if (s.startsWith("'") && s.endsWith("'")) s = s.slice(1, -1);
  s = s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, '\t')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/[ \t]{2,}/g, ' ');
  return s.trim() || null;
}

/** 官网占位值（http:// 等无意义地址）视为空 */
function cleanCorpUrl(raw?: string | null): string | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s || /^https?:\/\/[\s.]*$/i.test(s)) return null;
  return s;
}

/**
 * 同步引擎：把 ESI 数据落到本地库。
 * - 401 时自动用 refresh_token 刷新后重试
 * - 未配置 SSO 时自动使用 Mock 演示数据
 * - 军税：从军团钱包日志中的 player_tax/player_donation 聚合生成
 */
@Injectable()
export class EsiSyncService {
  private readonly logger = new Logger(EsiSyncService.name);
  private priceCache: Map<number, number> | null = null;
  private priceCacheAt = 0;
  /** 公开档案辅助缓存（种族/血统名称），懒加载一次 */
  private raceNames = new Map<number, string>();
  private bloodlineNames = new Map<number, { name: string; raceId?: number }>();
  private metaLoading: Promise<void> | null = null;
  /** 物品类型元数据缓存：type_id -> { name, groupId }（universe/types） */
  private typeMeta = new Map<number, { name?: string; groupId?: number }>();
  /** 物品分组名称缓存：group_id -> 分组名（universe/groups，作为“分类”展示） */
  private groupNames = new Map<number, string>();
  /** 空间站名称缓存：station_id -> 名称（universe/stations） */
  private stationNames = new Map<number, string>();
  /** 星系宇宙层级缓存：system_id -> { constellationId, regionId, regionName }（结构星域回填用） */
  private cosmicCache = new Map<number, { constellationId: number; regionId: number; regionName: string }>();
  /** 正在后台回填名称的角色（避免并发重复请求） */
  private nameRefreshing = new Set<number>();

  /**
   * 物品 ID 对照表解析：批量取 type_id -> { 名称, 分类 }。
   * 名称取自 universe/types，分类取该物品所属分组名（universe/groups），命中缓存不再请求。
   */
  private async itemLabels(typeIds: Array<number | null | undefined>): Promise<Record<number, { name?: string; category?: string }>> {
    const ids = [...new Set(typeIds.filter((v) => v != null && v > 0))];
    const out: Record<number, { name?: string; category?: string }> = {};
    const fresh: Array<{ id: number; meta: { name?: string; groupId?: number } }> = [];
    for (const id of ids) {
      const m = this.typeMeta.get(id);
      if (m) out[id] = { name: m.name, category: m.groupId != null ? this.groupNames.get(m.groupId) : undefined };
      else {
        try {
          const t = await this.esi.getUniverseType(id);
          if (t?.name) {
            const meta = { name: t.name, groupId: t.group_id ?? undefined };
            this.typeMeta.set(id, meta);
            fresh.push({ id, meta });
            out[id] = { name: meta.name };
          }
        } catch {
          // 类型不存在/无效，跳过
        }
      }
    }
    // 补齐新解析类型的分组名（一次解析，之后全部命中缓存）
    const groupIds = [...new Set(fresh.map((f) => f.meta.groupId).filter((v): v is number => v != null))];
    for (const gid of groupIds) {
      if (!this.groupNames.has(gid)) {
        try {
          const g = await this.esi.getUniverseGroup(gid);
          if (g?.name) this.groupNames.set(gid, g.name);
        } catch {}
      }
    }
    for (const { id, meta } of fresh) {
      if (meta.groupId != null) out[id].category = this.groupNames.get(meta.groupId);
    }
    return out;
  }

  /** 空间站名称（universe/stations，公开接口） */
  private async stationName(stationId: number): Promise<string | null> {
    if (this.stationNames.has(stationId)) return this.stationNames.get(stationId)!;
    let name: string | null = null;
    try {
      const s = await this.esi.getUniverseStation(stationId);
      name = s?.name || null;
    } catch {}
    this.stationNames.set(stationId, name);
    return name;
  }

  /**
   * 解析星系所属星座/星域：system → constellation → region 三级链路。
   * 结果进 cosmicCache，供结构星域回填；任一环节失败则该星系跳过。
   */
  private async resolveSystemCosmic(
    systemIds: number[],
  ): Promise<Record<number, { constellationId: number; regionId: number; regionName: string }>> {
    const out: Record<number, { constellationId: number; regionId: number; regionName: string }> = {};
    for (const sid of systemIds) {
      if (this.cosmicCache.has(sid)) {
        out[sid] = this.cosmicCache.get(sid)!;
        continue;
      }
      try {
        const sys = await this.esi.getUniverseSystem(sid);
        const constellationId = sys?.constellation_id;
        if (constellationId == null) continue;
        const con = await this.esi.getUniverseConstellation(constellationId);
        const regionId = con?.region_id;
        let regionName: string | null = null;
        if (regionId != null) {
          const region = await this.esi.getUniverseRegion(regionId);
          regionName = region?.name ?? null;
        }
        const info = { constellationId, regionId, regionName } as {
          constellationId: number;
          regionId: number;
          regionName: string;
        };
        this.cosmicCache.set(sid, info);
        out[sid] = info;
      } catch {
        // 星系无效/解析失败，跳过
      }
    }
    return out;
  }

  /** 克隆所在位置名称：空间站走公开接口；玩家建筑先查本地结构库，再尝试带角色 token 解析 */
  private async locationLabel(c: any, token?: string): Promise<string | null> {
    const id = c.location_id ?? c.locationId;
    const type = c.location_type ?? c.locationType;
    if (id == null) return null;
    if (type === 'station') return this.stationName(id);
    if (type === 'structure' || type === 'citadel' || type === 'player_station') {
      try {
        const local = await this.structures.displayName(String(id));
        if (local) return local;
      } catch {}
      if (token) {
        try {
          const s = await this.esi.getUniverseStructure(id, token);
          if (s?.name) return s.name;
        } catch {}
      }
      return null;
    }
    if (type === 'solar_system') {
      try {
        return await this.esi.resolveName(id);
      } catch {}
    }
    return null;
  }

  /**
   * 给“克隆体 / 忠诚点 / 工业任务”原始数组补名称字段（物品 ID、建筑 ID、军团 ID 对照）。
   * 只补缺失项；解析不到的保留原 ID，由前端展示兜底。
   */
  private async labelMiscArrays(
    arrays: { clones?: any[]; loyalty?: any[]; jobs?: any[] },
    token?: string,
  ): Promise<void> {
    // 军团 ID 对照表：忠诚点
    try {
      const rows = arrays.loyalty || [];
      const ids = [...new Set(rows.map((r) => r.corporation_id ?? r.corporationId).filter((v) => v != null))] as number[];
      if (ids.length) {
        const names = await this.esi.resolveNames(ids);
        for (const r of rows) {
          const id = r.corporation_id ?? r.corporationId;
          if (names[id] && r.corporationName == null) r.corporationName = names[id].name;
        }
      }
    } catch {}
    // 物品 ID 对照表：工业产物
    try {
      const rows = arrays.jobs || [];
      const ids = [...new Set(rows.map((r) => r.product_type_id ?? r.productTypeId).filter((v) => v != null))] as number[];
      if (ids.length) {
        const labels = await this.itemLabels(ids);
        for (const r of rows) {
          const id = r.product_type_id ?? r.productTypeId;
          const lb = labels[id];
          if (lb) {
            if (r.productName == null) r.productName = lb.name || null;
            if (r.productCategory == null) r.productCategory = lb.category || null;
          }
        }
      }
    } catch {}
    // 物品 ID + 建筑 ID 对照表：克隆位置与植入体
    try {
      const rows = arrays.clones || [];
      const implantIds = [...new Set(rows.flatMap((c) => c.implants || []))] as number[];
      const labels = implantIds.length ? await this.itemLabels(implantIds) : {};
      for (const c of rows) {
        if (c.implants?.length && c.implantNames == null) {
          c.implantNames = c.implants.map((i: number) => labels[i]?.name ?? i);
        }
        if (c.locationName == null) {
          c.locationName = await this.locationLabel(c, token).catch(() => null);
        }
      }
    } catch {}
  }

  /** 快照是否缺少需要回填的名称/分类字段 */
  private needsNamesRefresh(payload: any): boolean {
    const list = payload?.skills?.skills || [];
    if (list.some((r: any) => !r.name || !r.category)) return true;
    const clones = Array.isArray(payload?.clones) ? payload.clones : payload?.clones?.jump_clones || [];
    if ((payload?.loyalty || []).some((r: any) => !r.corporationName)) return true;
    if ((payload?.industryJobs || []).some((r: any) => !r.productName)) return true;
    if (clones.some((c: any) => !c.locationName || !c.implantNames)) return true;
    return false;
  }

  /**
   * 角色快照名称/分类回填（对照表解析后持久化）：
   * 技能与队列补名称+分类；克隆体补植入体名称与所在位置；忠诚点补军团名；工业补产物名。
   */
  async refreshSnapshotNames(characterId: number) {
    const snap = await this.snapshots.findOne({ where: { ownerType: 'character', ownerId: characterId } });
    if (!snap) return { found: false, counts: {} };
    const payload = JSON.parse(snap.payload);
    const counts: Record<string, number> = { skills: 0, queue: 0, implants: 0, locations: 0, loyalty: 0, jobs: 0 };
    const skillRows = payload.skills?.skills || [];
    const queueRows = payload.skillQueue || [];
    const skillIds = [...new Set([...skillRows, ...queueRows].map((r) => r.skill_id ?? r.typeId ?? r.type_id).filter((v) => v != null))] as number[];
    if (skillIds.length) {
      const labels = await this.itemLabels(skillIds);
      for (const r of skillRows) {
        const id = r.skill_id ?? r.typeId ?? r.type_id;
        const lb = labels[id];
        if (lb) {
          if (!r.name && lb.name) r.name = lb.name;
          if (!r.category && lb.category) r.category = lb.category;
          counts.skills++;
        }
      }
      for (const r of queueRows) {
        const id = r.skill_id ?? r.typeId ?? r.type_id;
        const lb = labels[id];
        if (lb) {
          if (!r.name && lb.name) r.name = lb.name;
          if (!r.category && lb.category) r.category = lb.category;
          counts.queue++;
        }
      }
    }
    const cloneRows = Array.isArray(payload.clones) ? payload.clones : payload.clones?.jump_clones || [];
    await this.labelMiscArrays({ clones: cloneRows, loyalty: payload.loyalty || [], jobs: payload.industryJobs || [] });
    counts.implants = cloneRows.filter((c: any) => c.implantNames).length;
    counts.locations = cloneRows.filter((c: any) => c.locationName).length;
    counts.loyalty = (payload.loyalty || []).filter((r: any) => r.corporationName).length;
    counts.jobs = (payload.industryJobs || []).filter((r: any) => r.productName).length;
    snap.payload = JSON.stringify(payload);
    await this.snapshots.save(snap);
    return { found: true, counts };
  }

  constructor(
    private readonly esi: EsiService,
    @InjectRepository(EveAccount) private readonly accounts: Repository<EveAccount>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    @InjectRepository(Asset) private readonly assets: Repository<Asset>,
    @InjectRepository(TaxRecord) private readonly taxes: Repository<TaxRecord>,
    @InjectRepository(SyncLog) private readonly logs: Repository<SyncLog>,
    @InjectRepository(WalletJournal) private readonly journals: Repository<WalletJournal>,
    @InjectRepository(WalletBalance) private readonly balances: Repository<WalletBalance>,
    @InjectRepository(CharacterSnapshot) private readonly snapshots: Repository<CharacterSnapshot>,
    private readonly structures: StructuresService,
    private readonly notify: NotifyService,
  ) {}

  private async log(source: string, entityId: number, status: 'success' | 'failed' | 'partial', message: string, durationMs?: number) {
    await this.logs.save(this.logs.create({ source, entityId, status, message, durationMs }));
  }

  private hasScope(account: EveAccount, scope: string): boolean {
    return (account.scopes || '').split(/\s+/).filter(Boolean).includes(scope);
  }

  /** 确保 token 可用：401 自动刷新后重试一次 */
  private async withToken<T>(account: EveAccount, fn: (token: string) => Promise<T>): Promise<T> {
    if (!account.accessToken) throw new Error('无 access_token');
    try {
      return await fn(account.accessToken);
    } catch (e: any) {
      if (e?.response?.status === 401 && account.refreshToken) {
        const pair = await this.esi.refreshAccessToken(account.refreshToken);
        account.accessToken = pair.accessToken;
        account.tokenExpiresAt = new Date(Date.now() + pair.expiresIn * 1000);
        if (pair.refreshToken) account.refreshToken = pair.refreshToken;
        await this.accounts.save(account);
        return await fn(account.accessToken);
      }
      throw e;
    }
  }

  private async snapshot(ownerType: 'character' | 'corporation', ownerId: number, partial: Record<string, any>) {
    const existing = await this.snapshots.findOne({ where: { ownerType, ownerId } });
    const payload = { ...(existing ? JSON.parse(existing.payload) : {}), ...partial };
    if (existing) {
      existing.payload = JSON.stringify(payload);
      await this.snapshots.save(existing);
    } else {
      await this.snapshots.save(this.snapshots.create({ ownerType, ownerId, payload: JSON.stringify(payload) }));
    }
  }

  /** 市场均价缓存（1 小时） */
  private async marketPrice(typeId: number): Promise<number> {
    if (!this.priceCache || Date.now() - this.priceCacheAt > 3600_000) {
      try {
        const prices = await this.esi.getMarketPrices();
        this.priceCache = new Map();
        for (const p of prices || []) {
          if (p.type_id != null && p.average_price != null) this.priceCache.set(p.type_id, p.average_price);
        }
        this.priceCacheAt = Date.now();
      } catch {
        this.priceCache = this.priceCache || new Map();
      }
    }
    return this.priceCache.get(typeId) || 0;
  }

  // ========================================================== 角色同步 ======

  /** 是否存在真实 SSO 绑定的账号（无则回退演示数据） */
  private async hasRealAccounts(): Promise<boolean> {
    const n = await this.accounts
      .createQueryBuilder('a')
      .where("a.refreshToken IS NOT NULL AND a.refreshToken != ''")
      .getCount();
    return n > 0;
  }

  /**
   * 角色绑定后自动创建其所属军团/联盟组织（isManaged），并写入该角色的成员记录。
   * 用于"绑定了角色但军团页没有军团信息"的场景：登录/绑定时自动带出军团。
   *
   * 注意：国服 SSO /verify 只返回角色 ID，不含军团/联盟信息；因此新角色首次
   * 登录/绑定时，此处会先经公开接口 /characters/{id} 补齐军团与联盟归属，
   * 确保组织架构能立刻带出所在军团（而非依赖后续手动同步）。
   */
  async ensureAccountOrgs(account: EveAccount): Promise<{ orgIds: number[]; created: number; memberAdded: boolean }> {
    if (!account.characterId) return { orgIds: [], created: 0, memberAdded: false };

    // 补齐角色所属军团/联盟（新角色登录时 verify 不含该信息，走公开接口）
    await this.enrichAccountOrgInfo(account);

    const orgIds: number[] = [];
    let created = 0;
    let memberAdded = false;

    // 1. 联盟组织
    if (account.allianceId) {
      let org = await this.orgs.findOne({ where: { id: account.allianceId } });
      if (!org) {
        let name = account.allianceName;
        let ticker: string | null = null;
        try {
          const info = await this.esi.getAlliance(account.allianceId);
          name = name || info.name;
          ticker = info.ticker || null;
        } catch (e) {
          this.logger.warn(`联盟 ${account.allianceId} 公开信息失败: ${e.message}`);
        }
        if (name) {
          org = await this.orgs.save(
            this.orgs.create({ id: account.allianceId, type: OrgType.ALLIANCE, name, ticker, isManaged: true }),
          );
          created++;
        }
      } else if (!org.isManaged) {
        // 此前由联盟同步/只读注册的联盟，有人登录后纳入管理
        org.isManaged = true;
        org = await this.orgs.save(org);
      }
      if (org) orgIds.push(org.id);
    }

    // 2. 军团组织
    if (account.corporationId) {
      let org = await this.orgs.findOne({ where: { id: account.corporationId } });
      if (!org) {
        let name = account.corporationName;
        let ticker: string | null = null;
        try {
          const info = await this.esi.getCorporation(account.corporationId);
          name = name || info.name;
          ticker = info.ticker || null;
        } catch (e) {
          this.logger.warn(`军团 ${account.corporationId} 公开信息失败: ${e.message}`);
        }
        if (name) {
          org = await this.orgs.save(
            this.orgs.create({
              id: account.corporationId,
              type: OrgType.CORPORATION,
              name,
              ticker,
              allianceId: account.allianceId ?? null,
              isManaged: true,
            }),
          );
          created++;
        }
      } else {
        // 已存在（可能是联盟同步的只读军团 / 之前信息不全时创建的）：
        // 纳入管理并修正所属联盟，保证组织树归属正确
        const patch: Partial<Organization> = {};
        if (!org.isManaged) patch.isManaged = true;
        if (account.allianceId != null && org.allianceId !== account.allianceId) patch.allianceId = account.allianceId;
        if (Object.keys(patch).length) org = await this.orgs.save(this.orgs.merge(org, patch));
      }
      if (org) orgIds.push(org.id);

      // 3. 写入该角色的成员记录
      if (org) {
        const existing = await this.memberships.findOne({ where: { characterId: account.characterId, orgId: org.id } });
        if (!existing) {
          await this.memberships.save(
            this.memberships.create({
              characterId: account.characterId,
              orgType: org.type,
              orgId: org.id,
              characterName: account.characterName,
            }),
          );
          memberAdded = true;
        }
      }
    }

    return { orgIds, created, memberAdded };
  }

  /**
   * 用公开接口补齐角色所属军团/联盟。
   * 国服 SSO verify 只返回角色 ID，军团/联盟 ID 需经 GET /characters/{id} 获取，
   * 名称经 universe/names 反查。补齐结果写回账号记录，供组织注册使用。
   */
  private async enrichAccountOrgInfo(account: EveAccount): Promise<void> {
    if (account.corporationId && account.allianceId) return;
    try {
      const info = await this.esi.getCharacter(account.characterId);
      if (!info) return;

      const corpId = account.corporationId || info.corporation_id || null;
      const allianceId = account.allianceId || info.alliance_id || null;

      // 名称缺失时批量反查（军团与联盟名都缺失时可一次批量）
      const nameIds: number[] = [];
      if (corpId && !account.corporationName) nameIds.push(corpId);
      if (allianceId && !account.allianceName) nameIds.push(allianceId);
      const names = nameIds.length ? await this.esi.resolveNames(nameIds) : {};

      const changed: Partial<EveAccount> = {};
      if (corpId !== account.corporationId) changed.corporationId = corpId;
      if (allianceId !== account.allianceId) changed.allianceId = allianceId;
      if (corpId && !account.corporationName && names[corpId]?.name) changed.corporationName = names[corpId].name;
      if (allianceId && !account.allianceName && names[allianceId]?.name) changed.allianceName = names[allianceId].name;

      if (Object.keys(changed).length) {
        await this.accounts.save(this.accounts.merge(account, changed));
      }
    } catch (e) {
      this.logger.warn(`角色 ${account.characterId} 补齐军团/联盟信息失败: ${e.message}`);
    }
  }

  /** 刷新账号 token（供定时任务/手动刷新使用） */
  async refreshAccountToken(account: EveAccount): Promise<EveAccount> {
    const pair = await this.esi.refreshAccessToken(account.refreshToken);
    account.accessToken = pair.accessToken;
    if (pair.refreshToken) account.refreshToken = pair.refreshToken;
    account.tokenExpiresAt = new Date(Date.now() + pair.expiresIn * 1000);
    if (pair.scopes) account.scopes = pair.scopes;
    return this.accounts.save(account);
  }

  /** 角色完整数据视图（前端设置页展示） */
  async characterData(accountId: number) {
    const account = await this.accounts.findOne({ where: { id: accountId } });
    if (!account) return null;
    const [snap, balance] = await Promise.all([
      this.snapshots.findOne({ where: { ownerType: 'character', ownerId: account.characterId } }),
      this.balances.find({ where: { ownerType: 'character', ownerId: account.characterId } }),
    ]);
    const payload = snap ? JSON.parse(snap.payload) : null;
    // 快照缺少名称/分类时后台回填一次（对照表解析），下次访问即完整
    if (payload && this.needsNamesRefresh(payload) && !this.nameRefreshing.has(account.characterId)) {
      this.nameRefreshing.add(account.characterId);
      this.refreshSnapshotNames(account.characterId)
        .catch((e) => this.logger.warn(`角色 ${account.characterId} 名称回填失败: ${e.message}`))
        .finally(() => this.nameRefreshing.delete(account.characterId));
    }
    return {
      id: account.id,
      characterId: account.characterId,
      characterName: account.characterName,
      corporationName: account.corporationName,
      allianceName: account.allianceName,
      avatarUrl: account.avatarUrl,
      scopes: account.scopes || '',
      auth: this.esi.classifyScopes(account.scopes),
      lastSyncedAt: account.lastSyncedAt,
      tokenExpired: !account.tokenExpiresAt || account.tokenExpiresAt.getTime() < Date.now(),
      balance: balance[0]?.balance ?? null,
      snapshot: payload,
    };
  }

  /** 角色公开档案：按需实时从 ESI 补全（无需授权，供成员详情等展示） */
  async characterPublicProfile(characterId: number) {
    const out: Record<string, any> = { characterId };
    try {
      const info = await this.esi.getCharacter(characterId);
      if (!info) return out;
      out.name = info.name;
      out.gender = info.gender;
      out.birthday = info.birthday ? String(info.birthday).slice(0, 10) : null;
      out.securityStatus = info.security_status;
      out.corporationId = info.corporation_id ?? null;
      out.allianceId = info.alliance_id ?? null;
      out.bloodlineId = info.bloodline_id ?? null;
      out.ancestryId = info.ancestry_id ?? null;
    } catch (e: any) {
      this.logger.warn(`角色 ${characterId} 公开档案失败: ${e.message}`);
    }

    // 当前军团/联盟名称（universe/names 缓存批量）
    try {
      const ids = [out.corporationId, out.allianceId].filter((v) => v != null) as number[];
      const names = await this.esi.resolveNames(ids);
      if (out.corporationId && names[out.corporationId]) out.corporationName = names[out.corporationId].name;
      if (out.allianceId && names[out.allianceId]) out.allianceName = names[out.allianceId].name;
    } catch {}

    // 管理组织（本地已有记录时补充 ticker）
    try {
      const ids = [out.corporationId, out.allianceId].filter((v) => v != null) as number[];
      if (ids.length) {
        const known = await this.orgs.find({ where: ids.map((id) => ({ id })) });
        for (const o of known || []) {
          if (o.id === out.corporationId) out.corporationTicker = o.ticker;
          if (o.id === out.allianceId) out.allianceTicker = o.ticker;
        }
      }
    } catch {}

    // 头像（无 token 的公开接口）
    try {
      const p = await this.esi.getCharacterPortrait(characterId);
      out.portraitUrl = p?.px256x256 || p?.px128x128 || p?.px64x64 || null;
    } catch {}

    // 种族 / 血统名（一次拉取后缓存）
    try {
      await this.ensureCharMetaNames();
      if (out.bloodlineId && this.bloodlineNames.has(out.bloodlineId)) {
        const bl = this.bloodlineNames.get(out.bloodlineId)!;
        out.bloodlineName = bl.name;
        if (bl.raceId != null) out.raceName = this.raceNames.get(bl.raceId) || null;
      }
    } catch {}

    return out;
  }

  /** 懒加载 universe/races + universe/bloodlines 名称映射 */
  private async ensureCharMetaNames(): Promise<void> {
    if (!this.metaLoading) {
      this.metaLoading = (async () => {
        try {
          const [races, bloodlines] = await Promise.all([
            this.esi.getAll<any>('/universe/races/'),
            this.esi.getAll<any>('/universe/bloodlines/'),
          ]);
          for (const r of races || []) if (r.race_id != null) this.raceNames.set(r.race_id, r.name);
          for (const b of bloodlines || []) {
            if (b.bloodline_id != null) this.bloodlineNames.set(b.bloodline_id, { name: b.name, raceId: b.race_id });
          }
        } catch (e) {
          this.logger.warn('universe races/bloodlines 元数据加载失败: ' + e.message);
        }
      })();
    }
    await this.metaLoading;
  }

  /** 同步单个已绑定角色（按授权 scope 自适应拉取） */
  async syncCharacter(accountId: number, userId?: number, force = false): Promise<{ ok: boolean; message: string; counts: Record<string, number> }> {
    const start = Date.now();
    const account = await this.accounts.findOne({
      where: { id: accountId },
      relations: userId ? ['user', 'platformUser'] : [],
    });
    if (!account) return { ok: false, message: '账号不存在', counts: {} };
    if (userId && account.user?.id !== userId && account.platformUser?.id !== userId) {
      return { ok: false, message: '无权同步该角色', counts: {} };
    }

    try {
      if (this.esi.enabled && account.accessToken) {
        const counts = await this.syncCharacterFromEsi(account, force);
        account.lastSyncedAt = new Date();
        await this.accounts.save(account);
        // 同步可能刚发现角色所属军团/联盟（新角色），成功后自动注册对应组织
        try {
          const r = await this.ensureAccountOrgs(account);
          if (r.created) this.logger.log(`角色 ${account.characterName} 自动注册 ${r.created} 个组织（同步后）`);
        } catch (e) {
          this.logger.warn(`角色 ${account.characterName} 同步后带出军团失败: ${e.message}`);
        }
        await this.log('character', account.characterId, 'success', `角色同步完成：${JSON.stringify(counts)}`, Date.now() - start);
        return { ok: true, message: '同步完成', counts };
      }
      account.lastSyncedAt = new Date();
      await this.accounts.save(account);
      await this.log('character', account.characterId, 'success', '角色信息同步完成（演示模式）', Date.now() - start);
      return { ok: true, message: '同步完成', counts: {} };
    } catch (e: any) {
      await this.log('character', account.characterId, 'failed', e?.message || '同步失败', Date.now() - start);
      return { ok: false, message: e?.message || '同步失败', counts: {} };
    }
  }

  private async syncCharacterFromEsi(account: EveAccount, force: boolean): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    const cid = account.characterId;
    const scopes = (account.scopes || '').split(/\s+/).filter(Boolean);

    // 公开信息（角色/军团/联盟）。公开接口只返回 ID，名称用 resolveName 补齐。
    try {
      const info = await this.esi.getCharacter(cid);
      if (info) {
        account.corporationId = info.corporation_id ?? account.corporationId;
        account.allianceId = info.alliance_id ?? account.allianceId;
        if (info.corporation_id && !account.corporationName) {
          account.corporationName = (await this.esi.resolveName(info.corporation_id).catch(() => null)) ?? account.corporationName;
        }
        if (info.alliance_id && !account.allianceName) {
          account.allianceName = (await this.esi.resolveName(info.alliance_id).catch(() => null)) ?? account.allianceName;
        }
      }
    } catch (e) {
      this.logger.warn(`角色 ${cid} 公开信息失败: ${e.message}`);
    }

    // 钱包
    if (scopes.includes(ESI_SCOPES.CHAR_WALLET)) {
      try {
        const balance = await this.withToken(account, (t) => this.esi.getCharacterWallet(cid, t));
        await this.upsertBalance('character', cid, 1, balance);
        counts.wallet = 1;
      } catch (e) {
        this.logger.warn(`角色 ${cid} 钱包失败: ${e.message}`);
      }
      try {
        const journal = await this.withToken(account, (t) => this.esi.getCharacterWalletJournal(cid, t));
        counts.journal = await this.upsertJournals('character', cid, 1, journal);
      } catch (e) {
        this.logger.warn(`角色 ${cid} 钱包日志失败: ${e.message}`);
      }
    }

    // 技能（附带类型名解析，便于详情页直接展示）
    if (scopes.includes(ESI_SCOPES.CHAR_SKILLS)) {
      try {
        const skills = await this.withToken(account, (t) => this.esi.getCharacterSkills(cid, t));
        if (skills) {
          const labels = skills.skills?.length ? await this.itemLabels(skills.skills.map((s: any) => s.skill_id)) : {};
          const list = (skills.skills || []).map((s: any) => ({
            ...s,
            name: labels[s.skill_id]?.name ?? null,
            category: labels[s.skill_id]?.category ?? null,
          }));
          await this.snapshot('character', cid, {
            skills: { totalSp: skills.total_sp, unallocatedSp: skills.unallocated_sp, count: list.length, skills: list },
          });
          counts.skills = list.length;
        }
      } catch (e) {
        this.logger.warn(`角色 ${cid} 技能失败: ${e.message}`);
      }
    }
    if (scopes.includes(ESI_SCOPES.CHAR_SKILLQUEUE)) {
      try {
        const queue = await this.withToken(account, (t) => this.esi.getCharacterSkillQueue(cid, t));
        if (queue?.length) {
          const labels = await this.itemLabels(queue.map((q: any) => q.skill_id));
          await this.snapshot('character', cid, {
            skillQueue: queue.map((q: any) => ({
              ...q,
              name: labels[q.skill_id]?.name ?? null,
              category: labels[q.skill_id]?.category ?? null,
            })),
          });
        } else {
          await this.snapshot('character', cid, { skillQueue: queue || [] });
        }
        counts.skillQueue = queue?.length || 0;
      } catch (e) {
        this.logger.warn(`角色 ${cid} 技能队列失败: ${e.message}`);
      }
    }

    // 位置/在线/舰船
    const locScopes = [ESI_SCOPES.CHAR_LOCATION, ESI_SCOPES.CHAR_ONLINE, ESI_SCOPES.CHAR_SHIP];
    const hasLoc = locScopes.some((s) => scopes.includes(s));
    if (hasLoc) {
      const loc: Record<string, any> = {};
      if (scopes.includes(ESI_SCOPES.CHAR_LOCATION)) {
        try {
          loc.location = await this.withToken(account, (t) => this.esi.getCharacterLocation(cid, t));
          loc.locationName = await this.esi.resolveName(loc.location?.solar_system_id).catch(() => null);
        } catch (e) {
          this.logger.warn(`角色 ${cid} 位置失败: ${e.message}`);
        }
      }
      if (scopes.includes(ESI_SCOPES.CHAR_ONLINE)) {
        try {
          loc.online = await this.withToken(account, (t) => this.esi.getCharacterOnline(cid, t));
        } catch (e) {
          this.logger.warn(`角色 ${cid} 在线状态失败: ${e.message}`);
        }
      }
      if (scopes.includes(ESI_SCOPES.CHAR_SHIP)) {
        try {
          loc.ship = await this.withToken(account, (t) => this.esi.getCharacterShip(cid, t));
        } catch (e) {
          this.logger.warn(`角色 ${cid} 舰船失败: ${e.message}`);
        }
      }
      await this.snapshot('character', cid, { location: loc });
      counts.location = 1;
    }

    // 资产
    if (scopes.includes(ESI_SCOPES.CHAR_ASSETS)) {
      try {
        const list = await this.withToken(account, (t) => this.esi.getCharacterAssets(cid, t));
        counts.assets = await this.saveAssets('character', cid, list);
      } catch (e: any) {
        // 国服 ESI 当前未开放资产路由（HTTP 404），静默跳过，数据源恢复后自动继续
        if (e?.response?.status !== 404) this.logger.warn(`角色 ${cid} 资产失败: ${e.message}`);
      }
    }

    // 蓝图
    if (scopes.includes(ESI_SCOPES.CHAR_BLUEPRINTS)) {
      try {
        const bps = await this.withToken(account, (t) => this.esi.getCharacterBlueprints(cid, t));
        counts.blueprints = await this.saveAssets('character', cid, (bps || []).map((b) => ({ item_id: b.item_id, type_id: b.type_id, quantity: b.quantity, location_id: b.location_id, is_blueprint_copy: b.is_blueprint_copy })));
      } catch (e) {
        this.logger.warn(`角色 ${cid} 蓝图失败: ${e.message}`);
      }
    }

    // 克隆/忠诚点/职位/工业
    const misc: Record<string, any> = {};
    if (scopes.includes(ESI_SCOPES.CHAR_CLONES)) {
      try {
        misc.clones = await this.withToken(account, (t) => this.esi.getCharacterClones(cid, t));
      } catch (e) {
        this.logger.warn(`角色 ${cid} 克隆失败: ${e.message}`);
      }
    }
    if (scopes.includes(ESI_SCOPES.CHAR_LOYALTY)) {
      try {
        misc.loyalty = await this.withToken(account, (t) => this.esi.getCharacterLoyalty(cid, t));
      } catch (e) {
        this.logger.warn(`角色 ${cid} 忠诚点失败: ${e.message}`);
      }
    }
    if (scopes.includes(ESI_SCOPES.CHAR_CORP_ROLES)) {
      try {
        misc.roles = await this.withToken(account, (t) => this.esi.getCharacterCorporationRoles(cid, t));
      } catch (e) {
        this.logger.warn(`角色 ${cid} 军团职位失败: ${e.message}`);
      }
    }
    if (scopes.includes(ESI_SCOPES.CHAR_INDUSTRY)) {
      try {
        misc.industryJobs = await this.withToken(account, (t) => this.esi.getCharacterIndustryJobs(cid, t));
      } catch (e) {
        this.logger.warn(`角色 ${cid} 工业任务失败: ${e.message}`);
      }
    }
    if (Object.keys(misc).length) {
      // 克隆/忠诚/工业的 ID 对照表解析（军团名、建筑名、物品名/分类），随同步持久化
      const cloneRows = Array.isArray(misc.clones) ? misc.clones : misc.clones?.jump_clones || [];
      try {
        await this.labelMiscArrays({ clones: cloneRows, loyalty: misc.loyalty || [], jobs: misc.industryJobs || [] }, account.accessToken);
      } catch (e) {
        this.logger.warn(`角色 ${cid} 名称对照解析失败: ${e.message}`);
      }
      await this.snapshot('character', cid, misc);
    }

    return counts;
  }

  // ========================================================== 军团同步 ======

  /** 同步组织数据：联盟走公开信息+成员军团；军团走真实 ESI / Mock */
  async syncOrg(
    orgId: number,
    forceMock = false,
    actor?: { sub: number; role: string },
  ): Promise<{ ok: boolean; message: string; counts: Record<string, number> }> {
    const start = Date.now();
    const org = await this.orgs.findOne({ where: { id: orgId } });
    if (!org) return { ok: false, message: '组织不存在', counts: {} };

    // 手动触发的同步需要校验：管理员可直接同步；普通成员仅可同步自己有军团授权角色在籍的军团/联盟
    if (actor && !(await this.canSyncOrg(actor, org))) {
      const hint =
        org.type === OrgType.ALLIANCE
          ? '权限不足：需有该联盟内完成军团授权（corp scope）的角色才能同步联盟信息'
          : '权限不足：需要绑定该军团且带军团授权的角色后才能同步（可在角色绑定中完成 corp 二次授权）';
      throw new ForbiddenException(hint);
    }

    const useMock = forceMock || !(await this.hasRealAccounts());
    try {
      const counts: Record<string, number> = {};
      if (org.type === OrgType.ALLIANCE) {
        Object.assign(counts, await this.runAllianceSync(org, useMock));
      } else if (useMock) {
        await this.syncOrgFromMock(org, counts);
      } else {
        const director = await this.findDirector(org);
        if (director?.accessToken) {
          await this.syncOrgFromEsi(org, director, counts);
        } else {
          counts.members = await this.syncPublicCorporation(org);
        }
      }
      const source = org.type === OrgType.ALLIANCE ? 'alliance' : 'corporation';
      await this.log(source, orgId, 'success', org.type === OrgType.ALLIANCE ? '联盟信息同步完成' : '组织数据同步完成', Date.now() - start);
      return { ok: true, message: '同步完成', counts };
    } catch (e: any) {
      await this.log(org.type === OrgType.ALLIANCE ? 'alliance' : 'corporation', orgId, 'failed', e?.message || '同步失败', Date.now() - start);
      return { ok: false, message: e?.message || '同步失败', counts: {} };
    }
  }

  /**
   * 校验当前用户是否可触发指定组织的同步：
   * - admin / officer / super_admin 始终放行（管理口径）；
   * - 普通 member/viewer：军团需自己账号在该军团且在籍拥有军团授权（corp scope）；
   *   联盟需自己账号在联盟内的某个军团完成军团授权。
   */
  private async canSyncOrg(actor: { sub: number; role: string }, org: Organization): Promise<boolean> {
    if (['admin', 'officer', 'super_admin'].includes(actor.role)) return true;
    // 平台账号=名下聚合角色并集；EVE 角色身份=自身账号。二者都可用该集合换算
    const mine = await this.accounts.find({
      where: [{ user: { id: actor.sub } }, { platformUser: { id: actor.sub } }],
    });
    const authed = mine.filter((a) => this.esi.hasCorpAuth(a.scopes));
    if (org.type === OrgType.CORPORATION) return authed.some((a) => a.corporationId === org.id);
    if (org.type === OrgType.ALLIANCE) return authed.some((a) => a.allianceId === org.id);
    return false;
  }

  /**
   * 选取可作为军团数据拉取代理的账号（需具备军团管理授权）。
   * 仅做「个人授权」的角色不能拉取军团级数据，其所在军团只会退化为公开/成员数同步。
   */
  private async findDirector(org: Organization): Promise<EveAccount | null> {
    const members = await this.memberships.find({ where: { orgId: org.id, isActive: true } });
    for (const m of members.slice(0, 100)) {
      const account = await this.accounts.findOne({ where: { characterId: m.characterId } });
      if (account?.accessToken && this.esi.hasCorpAuth(account.scopes)) return account;
    }
    return null;
  }

  /** 选取可作为联盟建筑拉取代理的账号（需具备 esi-alliances.read_structures.v1） */
  private async findAllianceDirector(org: Organization): Promise<EveAccount | null> {
    const members = await this.memberships.find({ where: { orgId: org.id, isActive: true } });
    for (const m of members.slice(0, 100)) {
      const account = await this.accounts.findOne({ where: { characterId: m.characterId } });
      if (account?.accessToken && (account.scopes || '').split(/\s+/).includes(ESI_SCOPES.ALLIANCE_STRUCTURES)) {
        return account;
      }
    }
    return null;
  }

  private async syncOrgFromEsi(org: Organization, director: EveAccount, counts: Record<string, number>) {
    const scopes = (director.scopes || '').split(/\s+/).filter(Boolean);
    const id = org.id;

    // 成员列表
    if (scopes.includes(ESI_SCOPES.CORP_MEMBERS)) {
      try {
        const memberIds = await this.withToken(director, (t) => this.esi.getCorporationMembers(id, t));
        const names = await this.esi.resolveNames(memberIds);
        for (const cid of memberIds || []) {
          await this.upsertMembership(org, cid, names[cid]?.name || `角色#${cid}`, undefined, 0, [], undefined);
        }
        counts.members = (memberIds || []).length;
      } catch (e) {
        this.logger.warn(`军团 ${id} 成员失败: ${e.message}`);
      }
    }

    // 成员追踪（最近登录 / 所在星系 / 舰船）
    if (scopes.includes(ESI_SCOPES.CORP_TRACKING)) {
      try {
        const tracking = await this.withToken(director, (t) => this.esi.getCorporationMemberTracking(id, t));
        const systemIds = (tracking || []).map((t: any) => t.location_id).filter(Boolean);
        const names = await this.esi.resolveNames(systemIds);
        for (const tr of tracking || []) {
          const m = await this.memberships.findOne({ where: { characterId: tr.character_id, orgId: id } });
          if (m) {
            m.lastLogin = tr.logon_date ? new Date(tr.logon_date) : m.lastLogin;
            m.locationName = names[tr.location_id]?.name || m.locationName;
            await this.memberships.save(m);
          }
        }
        counts.tracking = (tracking || []).length;
      } catch (e) {
        this.logger.warn(`军团 ${id} 成员追踪失败: ${e.message}`);
      }
    }

    // 钱包 + 钱包日志（军税来源）
    if (scopes.includes(ESI_SCOPES.CORP_WALLETS)) {
      try {
        const wallets = await this.withToken(director, (t) => this.esi.getCorporationWallets(id, t));
        for (const w of wallets || []) {
          await this.upsertBalance('corporation', id, w.division, w.balance);
        }
        counts.wallets = (wallets || []).length;
      } catch (e) {
        this.logger.warn(`军团 ${id} 钱包失败: ${e.message}`);
      }
      try {
        let totalJournal = 0;
        for (let division = 1; division <= 7; division++) {
          try {
            const journal = await this.withToken(director, (t) => this.esi.getCorporationWalletJournal(id, t, division));
            totalJournal += await this.upsertJournals('corporation', id, division, journal);
          } catch (e) {
            if (e?.response?.status !== 404) this.logger.warn(`军团 ${id} 钱包${division}日志失败: ${e.message}`);
          }
        }
        counts.journal = totalJournal;
        counts.taxRecords = await this.aggregateTaxes(org);
      } catch (e) {
        this.logger.warn(`军团 ${id} 钱包日志失败: ${e.message}`);
      }
    }

    // 资产
    if (scopes.includes(ESI_SCOPES.CORP_ASSETS)) {
      try {
        const list = await this.withToken(director, (t) => this.esi.getCorporationAssets(id, t));
        counts.assets = await this.saveAssets('corporation', id, list);
      } catch (e: any) {
        // 国服 ESI 当前未开放资产路由（HTTP 404），静默跳过，数据源恢复后自动继续
        if (e?.response?.status !== 404) this.logger.warn(`军团 ${id} 资产失败: ${e.message}`);
      }
    }

    // 蓝图
    if (scopes.includes(ESI_SCOPES.CORP_BLUEPRINTS)) {
      try {
        const bps = await this.withToken(director, (t) => this.esi.getCorporationBlueprints(id, t));
        counts.blueprints = await this.saveAssets('corporation', id, (bps || []).map((b: any) => ({ item_id: b.item_id, type_id: b.type_id, quantity: b.quantity, location_id: b.location_id, is_blueprint_copy: b.is_blueprint_copy })));
      } catch (e) {
        this.logger.warn(`军团 ${id} 蓝图失败: ${e.message}`);
      }
    }

    // 建筑（独立落库，便于列表/筛选），其余 corpExtra 存快照
    const corpExtra: Record<string, any> = {};
    if (scopes.includes(ESI_SCOPES.CORP_STRUCTURES)) {
      try {
        const raw = await this.withToken(director, (t) => this.esi.getCorporationStructures(id, t));
        counts.structures = await this.structures.saveStructures(id, raw || []);
        await this.structures.resolveNames({ corporationId: id }, (ids) => this.esi.resolveNames(ids));
        await this.structures.enrichLocations({ corporationId: id }, (sids) => this.resolveSystemCosmic(sids));
      } catch (e) {
        this.logger.warn(`军团 ${id} 结构失败: ${e.message}`);
      }
    }
    if (scopes.includes(ESI_SCOPES.CORP_DIVISIONS)) {
      try {
        corpExtra.divisions = await this.withToken(director, (t) => this.esi.getCorporationDivisions(id, t));
      } catch (e) {
        this.logger.warn(`军团 ${id} 分部失败: ${e.message}`);
      }
    }
    if (scopes.includes(ESI_SCOPES.CORP_INDUSTRY)) {
      try {
        corpExtra.industryJobs = await this.withToken(director, (t) => this.esi.getCorporationIndustryJobs(id, t));
      } catch (e) {
        this.logger.warn(`军团 ${id} 工业失败: ${e.message}`);
      }
    }
    if (Object.keys(corpExtra).length) {
      await this.snapshot('corporation', id, corpExtra);
    }
  }

  /** ESI 军团公开信息 → 增量更新字段（成员数/税率/CEO/创建人/成立日期/描述/官网） */
  private corpPublicPatch(info: any, org?: Organization): Partial<Organization> {
    const patch: Partial<Organization> = {};
    if (!info) return patch;
    if (info.member_count != null && info.member_count !== org?.esiMemberCount) patch.esiMemberCount = info.member_count;
    if (info.tax_rate != null && info.tax_rate !== org?.esiTaxRate) patch.esiTaxRate = info.tax_rate;
    if (info.ceo_id != null && info.ceo_id !== org?.ceoId) patch.ceoId = info.ceo_id;
    if (info.creator_id != null && info.creator_id !== org?.creatorId) patch.creatorId = info.creator_id;
    const founded = info.date_founded ? String(info.date_founded).slice(0, 10) : null;
    if (founded && founded !== org?.dateFounded) patch.dateFounded = founded;
    const desc = decodeCorpDescription(info.description);
    if (desc !== org?.description) patch.description = desc;
    const site = cleanCorpUrl(info.url);
    if (site !== org?.url) patch.url = site;
    return patch;
  }

  /** 真实 ESI：军团公开信息（成员数/税率/CEO/创建人/成立/描述/官网），回填快照供展示 */
  private async syncPublicCorporation(org: Organization): Promise<number> {
    const data = await this.esi.getCorporation(org.id);
    if (data) {
      const patch = this.corpPublicPatch(data, org);
      if (Object.keys(patch).length) await this.orgs.save(this.orgs.merge(org, patch));
      // CEO/创建人姓名解析写回（universe/names 一次批量）
      if (data.ceo_id || data.creator_id) await this.resolveLeaderNames([org]);
    }
    return data?.member_count ?? 0;
  }

  /** 批量把角色 ID（CEO/创建人/联盟创建者）解析成名字写回（无 ID 自动跳过） */
  private async resolveLeaderNames(rows: Organization[]) {
    const ids = [...new Set(rows.flatMap((r) => [r.ceoId, r.creatorId]).filter((v) => v != null))] as number[];
    if (!ids.length) return;
    let names: Record<number, { name: string; category: string }> = {};
    try {
      names = await this.esi.resolveNames(ids);
    } catch (e: any) {
      this.logger.warn(`CEO/创建人角色名解析失败: ${e.message}`);
      return;
    }
    for (const row of rows) {
      const patch: Partial<Organization> = {};
      if (row.ceoId != null && names[row.ceoId]?.name) patch.ceoName = names[row.ceoId].name;
      if (row.creatorId != null && names[row.creatorId]?.name) patch.creatorName = names[row.creatorId].name;
      if (Object.keys(patch).length) await this.orgs.save(this.orgs.merge(row, patch));
    }
  }

  /** 联盟同步：成员军团列表 + 公开信息（含执行军团标记） */
  async syncAlliance(orgId: number): Promise<{ ok: boolean; message: string; counts: Record<string, number> }> {
    const start = Date.now();
    const org = await this.orgs.findOne({ where: { id: orgId } });
    if (!org || org.type !== OrgType.ALLIANCE) return { ok: false, message: '组织不存在或不是联盟', counts: {} };
    try {
      const counts = await this.runAllianceSync(org, false);
      await this.log('alliance', orgId, 'success', `联盟信息同步完成（${counts.corps ?? 0} 个军团）`, Date.now() - start);
      return { ok: true, message: '同步完成', counts };
    } catch (e: any) {
      await this.log('alliance', orgId, 'failed', e?.message || '同步失败', Date.now() - start);
      return { ok: false, message: e?.message || '同步失败', counts: {} };
    }
  }

  /**
   * 联盟同步主体：回填联盟公开元数据（名称/Ticker/执行军团/成立日期），
   * 并登记联盟下属军团。useMock=true 时走演示数据。
   */
  private async runAllianceSync(org: Organization, useMock: boolean): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    if (useMock) {
      await this.syncAllianceFromMock(org, counts);
      return counts;
    }

    // 需要解析姓名的角色（CEO/创建人/联盟创建者），一轮结束后批量解析
    const leaderRows: Organization[] = [];

    // 1) 联盟公开信息：执行军团 / 成立日期 / 创建人(creator_id) 等
    try {
      const info = await this.esi.getAlliance(org.id);
      if (info) {
        const patch: Partial<Organization> = {};
        if (info.name && info.name !== org.name) patch.name = info.name;
        if (info.ticker && info.ticker !== org.ticker) patch.ticker = info.ticker;
        if (info.executor_corporation_id && info.executor_corporation_id !== org.executorCorporationId) {
          patch.executorCorporationId = info.executor_corporation_id;
        }
        if (info.date_founded && String(info.date_founded).slice(0, 10) !== org.dateFounded) {
          patch.dateFounded = String(info.date_founded).slice(0, 10);
        }
        if (info.creator_id && info.creator_id !== org.creatorId) patch.creatorId = info.creator_id;
        if (Object.keys(patch).length) await this.orgs.save(this.orgs.merge(org, patch));
        if (org.creatorId) leaderRows.push(org); // 联盟创建者姓名稍后批量解析
        counts.alliance = 1;
      }
    } catch (e: any) {
      this.logger.warn(`联盟 ${org.id} 公开信息失败: ${e.message}`);
    }

    // 2) 下属军团列表：未注册的自动加入（只读可见，isManaged=false）；
    //    所有下属军团都刷新 ESI 公开信息（成员数/税率/CEO/创建人/成立/描述/官网，均无需授权）
    const corps = await this.esi.getAllianceCorporations(org.id);
    let registered = 0;
    for (const cid of corps || []) {
      const exists = await this.orgs.findOne({ where: { id: cid } });
      if (!exists) {
        try {
          const info = await this.esi.getCorporation(cid);
          if (!info?.name) {
            this.logger.warn(`联盟 ${org.id} 军团 ${cid} 公开信息缺失`);
            continue;
          }
          const created = this.orgs.create({
            id: cid,
            type: OrgType.CORPORATION,
            name: info.name,
            ticker: info.ticker,
            allianceId: org.id,
            isManaged: false,
            taxRate: 0,
            ...this.corpPublicPatch(info),
          });
          await this.orgs.save(created);
          if (info.ceo_id || info.creator_id) leaderRows.push(created);
          registered++;
        } catch (e) {
          this.logger.warn(`联盟 ${org.id} 军团 ${cid} 登记失败: ${e.message}`);
        }
      } else if (exists.type === OrgType.CORPORATION) {
        // 已登记的军团：刷新归属联盟 + 公开快照（成员数/税率/CEO/创建人/成立/描述/官网）
        try {
          const info = await this.esi.getCorporation(cid);
          const patch = this.corpPublicPatch(info ?? {}, exists);
          if (exists.allianceId !== org.id) patch.allianceId = org.id; // 角色换盟等场景
          if (Object.keys(patch).length) await this.orgs.save(this.orgs.merge(exists, patch));
          if (info?.ceo_id || info?.creator_id) leaderRows.push(exists);
        } catch (e) {
          this.logger.warn(`联盟 ${org.id} 军团 ${cid} 公开信息刷新失败: ${e.message}`);
        }
      }
    }
    // 3) 联盟建筑：需具备 esi-alliances.read_structures.v1 的成员账号；无则跳过（不影响其余同步）
    try {
      const director = await this.findAllianceDirector(org);
      if (director?.accessToken) {
        const raw = await this.withToken(director, (t) => this.esi.getAllianceStructures(org.id, t));
        counts.structures = await this.structures.saveAllianceStructures(org.id, raw || []);
        await this.structures.resolveNames({ allianceId: org.id }, (ids) => this.esi.resolveNames(ids));
        await this.structures.enrichLocations({ allianceId: org.id }, (sids) => this.resolveSystemCosmic(sids));
      }
    } catch (e) {
      this.logger.warn(`联盟 ${org.id} 结构失败: ${e.message}`);
    }
    // 4) CEO/创建人/联盟创建者角色名（universe/names 一次批量解析后写回）
    await this.resolveLeaderNames(leaderRows);
    counts.corps = (corps || []).length;
    counts.registered = registered;
    return counts;
  }

  /** 演示数据下的联盟同步：回填执行军团/成立日期并统计下属军团 */
  private async syncAllianceFromMock(org: Organization, counts: Record<string, number>) {
    const a = ALLIANCES.find((x) => x.id === org.id);
    if (a) {
      const patch: Partial<Organization> = {};
      if (a.name && a.name !== org.name) patch.name = a.name;
      if (a.ticker && a.ticker !== org.ticker) patch.ticker = a.ticker;
      if (a.executorCorpId && a.executorCorpId !== org.executorCorporationId) patch.executorCorporationId = a.executorCorpId;
      if (a.dateFounded && a.dateFounded !== org.dateFounded) patch.dateFounded = a.dateFounded;
      if (Object.keys(patch).length) await this.orgs.save(this.orgs.merge(org, patch));
    }
    counts.alliance = 1;
    const corps = await this.orgs.find({ where: { type: OrgType.CORPORATION, allianceId: org.id } });
    counts.corps = corps.length;
    // 联盟建筑（演示数据）
    const structures = mockAllianceStructures(org.id);
    if (structures.length) {
      counts.structures = await this.structures.saveAllianceStructures(org.id, structures);
      await this.structures.resolveNames({ allianceId: org.id }, async () => mockStructureNames(structures));
      await this.structures.enrichLocations({ allianceId: org.id }, async (sids) => mockSystemCosmic(sids));
    }
  }

  // ======================================================== 落库工具 ========

  private async upsertBalance(ownerType: 'character' | 'corporation', ownerId: number, division: number, balance: number) {
    const existing = await this.balances.findOne({ where: { ownerType, ownerId, division } });
    if (existing) {
      existing.balance = balance;
      await this.balances.save(existing);
    } else {
      await this.balances.save(this.balances.create({ ownerType, ownerId, division, balance }));
    }
  }

  /** 增量写入钱包日志（journalId 去重），返回新增条数 */
  private async upsertJournals(ownerType: 'character' | 'corporation', ownerId: number, division: number, list: any[]): Promise<number> {
    if (!list || !list.length) return 0;
    let added = 0;
    for (const j of list) {
      if (j.id == null) continue;
      const exists = await this.journals.findOne({ where: { journalId: j.id } });
      if (exists) continue;
      const charName = j.first_party_id ? await this.esi.resolveName(j.first_party_id).catch(() => null) : null;
      await this.journals.save(
        this.journals.create({
          ownerType,
          ownerId,
          division,
          journalId: j.id,
          date: new Date(j.date),
          refType: j.ref_type,
          characterId: j.first_party_id ?? null,
          characterName: charName || null,
          amount: j.amount,
          balance: j.balance,
          reason: j.reason,
          contextId: j.context_id ?? null,
        }),
      );
      added++;
    }
    return added;
  }

  /** 资产/蓝图落库：全量覆盖（先清后插） */
  private async saveAssets(ownerType: 'character' | 'corporation', ownerId: number, list: any[]): Promise<number> {
    await this.assets.delete({ ownerType, ownerId });
    if (!list || !list.length) return 0;

    const typeIds = [...new Set(list.map((a) => a.type_id).filter(Boolean))];
    const names = await this.esi.resolveNames(typeIds);
    const locationIds = [...new Set(list.map((a) => a.location_id).filter(Boolean))];
    const locNames = await this.esi.resolveNames(locationIds);

    for (const a of list) {
      const typeName = names[a.type_id]?.name || `#${a.type_id}`;
      const isBlueprint = a.is_blueprint_copy != null || a.is_blueprint == true;
      const price = await this.marketPrice(a.type_id);
      await this.assets.save(
        this.assets.create({
          ownerType,
          ownerId,
          itemId: a.item_id,
          typeId: a.type_id,
          typeName,
          locationId: a.location_id ?? null,
          locationName: locNames[a.location_id]?.name || (a.location_flag ? `[${a.location_flag}]` : null),
          quantity: a.quantity || 1,
          isBlueprint,
          isSingleton: Boolean(a.is_singleton),
          estimatedValue: isBlueprint ? price : price * (a.quantity || 1),
        }),
      );
    }
    return list.length;
  }

  /** 从军团钱包日志聚合军税：player_tax/player_donation 按 角色×年月 汇总 */
  private async aggregateTaxes(org: Organization): Promise<number> {
    const rows: Array<{ ym: string; characterId: number | null; characterName: string | null; total: number }> = await this.journals
      .createQueryBuilder('j')
      .select(`strftime('%Y-%m', j.date)`, 'ym')
      .addSelect('j.characterId', 'characterId')
      .addSelect('j.characterName', 'characterName')
      .addSelect('SUM(j.amount)', 'total')
      .where('j.ownerType = :t AND j.ownerId = :orgId AND j.refType IN (:...types)', {
        t: 'corporation',
        orgId: org.id,
        types: TAX_REF_TYPES,
      })
      .groupBy(`strftime('%Y-%m', j.date), j.characterId`)
      .getRawMany();

    // 覆盖式写入：清空该组织的税单后重建
    await this.taxes.delete({ orgId: org.id });
    let n = 0;
    for (const r of rows) {
      if (!r.characterId || !r.ym) continue;
      const [y, m] = r.ym.split('-');
      const existing = await this.taxes.findOne({
        where: { orgId: org.id, characterId: r.characterId, year: Number(y), month: Number(m) },
      });
      if (existing) {
        existing.amount = Math.round(r.total);
        await this.taxes.save(existing);
      } else {
        await this.taxes.save(
          this.taxes.create({
            orgId: org.id,
            orgName: org.name,
            characterId: r.characterId,
            characterName: r.characterName || `角色#${r.characterId}`,
            year: Number(y),
            month: Number(m),
            amount: Math.round(r.total),
          }),
        );
      }
      n++;
    }
    if (n > 0) {
      try {
        await this.notify.push({
          title: '月度军税账单已生成',
          body: `${org.name} ${rows.length ? '' : ''}本期共聚合 ${n} 条成员税单，可在「财务与税务」查看与导出。`,
          channel: 'inapp',
          event: 'tax',
          meta: { orgId: org.id, orgName: org.name, count: n },
        });
      } catch {}
    }
    return n;
  }

  // ========================================================== Mock 数据 ======

  private async syncOrgFromMock(org: Organization, counts: Record<string, number>) {
    if (org.type === OrgType.CORPORATION) {
      // 钱包余额（1~7 分部，演示）
      for (let d = 1; d <= 7; d++) {
        const base = d * 2_000_000_000 + Math.random() * 8_000_000_000;
        await this.upsertBalance('corporation', org.id, d, Math.round(base));
      }
      counts.wallets = 7;

      const members = mockCorporationMembers(org.id);
      for (const m of members) {
        await this.upsertMembership(org, m.characterId, m.characterName, m.sp, m.monthlyTax, m.roles, m.lastLogin);
      }
      counts.members = members.length;

      const assets = mockCorporationAssets(org.id);
      await this.assets.delete({ ownerType: 'corporation', ownerId: org.id });
      for (const a of assets) {
        await this.assets.save(
          this.assets.create({
            ownerType: 'corporation',
            ownerId: org.id,
            itemId: a.itemId,
            typeId: a.typeId,
            typeName: a.typeName,
            locationId: a.locationId,
            locationName: a.locationName,
            quantity: a.quantity,
            isBlueprint: a.isBlueprint,
            isSingleton: a.isSingleton,
            estimatedValue: a.estimatedValue,
          }),
        );
      }
      counts.assets = assets.length;

      const taxRecords = mockTaxRecords(org.id, org.name);
      await this.taxes.delete({ orgId: org.id });
      for (const t of taxRecords) {
        await this.taxes.save(
          this.taxes.create({
            orgId: org.id,
            orgName: org.name,
            characterId: t.characterId,
            characterName: t.characterName,
            year: t.year,
            month: t.month,
            amount: Math.round(t.amount),
          }),
        );
      }
      counts.taxRecords = taxRecords.length;

      // 建筑（Upwell 结构等）：与真实同步口径一致，独立落库供列表/筛选
      const structures = mockCorporationStructures(org.id);
      if (structures.length) {
        counts.structures = await this.structures.saveStructures(org.id, structures);
        await this.structures.resolveNames({ corporationId: org.id }, async () => mockStructureNames(structures));
        await this.structures.enrichLocations({ corporationId: org.id }, async (sids) => mockSystemCosmic(sids));
      }
    }
  }

  private async upsertMembership(
    org: Organization,
    characterId: number,
    characterName: string,
    sp?: number,
    monthlyTax = 0,
    roles: string[] = [],
    lastLogin?: Date,
  ) {
    if (sp === undefined) {
      const snap = await this.snapshots.findOne({ where: { ownerType: 'character', ownerId: characterId } });
      if (snap) {
        const p = JSON.parse(snap.payload);
        sp = p?.skills?.totalSp ?? p?.totalSp ?? undefined;
      }
    }
    const existing = await this.memberships.findOne({ where: { characterId, orgId: org.id } });
    const now = new Date();
    if (existing) {
      existing.characterName = characterName;
      if (sp !== undefined) existing.sp = sp;
      existing.monthlyTax = monthlyTax;
      existing.roles = JSON.stringify(roles);
      if (lastLogin) existing.lastLogin = lastLogin;
      existing.isActive = true;
      existing.lastActivityAt = now;
      existing.activityTier = MembersService.tierFromActivity(now, true);
      await this.memberships.save(existing);
    } else {
      await this.memberships.save(
        this.memberships.create({
          characterId,
          characterName,
          orgType: org.type,
          orgId: org.id,
          sp: sp ?? 0,
          monthlyTax,
          roles: JSON.stringify(roles),
          lastLogin: lastLogin || new Date(),
          isActive: true,
          joinedAt: new Date(),
          lastActivityAt: now,
          activityTier: 'active',
        }),
      );
    }
  }

  /** 初始化演示组织（首次运行或点击"导入演示数据"） */
  async seedDemoData(): Promise<{ orgs: number; members: number }> {
    let orgCount = 0;
    let memberCount = 0;

    const existingAlliance = await this.orgs.find({ where: { type: OrgType.ALLIANCE } });
    if (existingAlliance.length === 0) {
      for (const a of ALLIANCES) {
        await this.orgs.save(
          this.orgs.create({
            id: a.id,
            type: OrgType.ALLIANCE,
            name: a.name,
            ticker: a.ticker,
            isManaged: true,
            taxRate: a.taxRate,
            executorCorporationId: a.executorCorpId,
            dateFounded: a.dateFounded,
          }),
        );
        orgCount++;
      }
      for (const c of CORPS) {
        await this.orgs.save(
          this.orgs.create({
            id: c.id,
            type: OrgType.CORPORATION,
            name: c.name,
            ticker: c.ticker,
            allianceId: c.allianceId,
            isManaged: true,
            taxRate: c.taxRate,
          }),
        );
        orgCount++;
      }
    } else {
      orgCount = await this.orgs.count();
    }
    // 已导入过的演示联盟也补齐执行军团/成立时间等元数据
    for (const a of ALLIANCES) {
      const org = await this.orgs.findOne({ where: { id: a.id, type: OrgType.ALLIANCE } });
      if (!org) continue;
      const tmp: Record<string, number> = {};
      await this.syncAllianceFromMock(org, tmp);
    }

    const corps = await this.orgs.find({ where: { type: OrgType.CORPORATION, isManaged: true } });
    for (const c of corps) {
      const res = await this.syncOrg(c.id, true);
      memberCount += res.counts.members || 0;
    }
    return { orgs: orgCount, members: memberCount };
  }

  /**
   * 清空演示数据：仅删除演示组织（ALLIANCES/CORPS 固定 ID）及其关联的
   * 成员、税单、钱包余额、资产、快照与同步日志。不影响真实同步的组织和已绑定账号。
   */
  async clearDemoData(): Promise<{
    deletedOrgs: number;
    deletedMembers: number;
    deletedTaxes: number;
    deletedBalances: number;
    deletedAssets: number;
    deletedLogs: number;
  }> {
    const demoOrgIds = [...new Set([...ALLIANCES.map((a) => a.id), ...CORPS.map((c) => c.id)])];
    const existing = await this.orgs.find({ where: { id: In(demoOrgIds) } });
    const ids = existing.map((o) => o.id);
    if (ids.length === 0) {
      return { deletedOrgs: 0, deletedMembers: 0, deletedTaxes: 0, deletedBalances: 0, deletedAssets: 0, deletedLogs: 0 };
    }
    const delMembers = await this.memberships.delete({ orgId: In(ids) });
    const delTaxes = await this.taxes.delete({ orgId: In(ids) });
    const delBalances = await this.balances.delete({ ownerType: 'corporation', ownerId: In(ids) });
    const delAssets = await this.assets.delete({ ownerType: 'corporation', ownerId: In(ids) });
    const delSnapshots = await this.snapshots.delete({ ownerType: 'corporation', ownerId: In(ids) });
    const delLogs = await this.logs.delete({ entityId: In(ids) });
    const delOrgs = await this.orgs.delete(ids);
    return {
      deletedOrgs: delOrgs.affected ?? 0,
      deletedMembers: delMembers.affected ?? 0,
      deletedTaxes: delTaxes.affected ?? 0,
      deletedBalances: delBalances.affected ?? 0,
      deletedAssets: delAssets.affected ?? 0,
      deletedLogs: delLogs.affected ?? 0,
    };
  }

  /** 最近同步日志 */
  async recentLogs(limit = 20) {
    return this.logs.find({ order: { createdAt: 'DESC' }, take: limit });
  }
}
