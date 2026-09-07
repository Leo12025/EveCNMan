import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // 秒
  scopes: string;
}

export interface VerifyInfo {
  CharacterID: number;
  CharacterName: string;
  CorporationID: number;
  CorporationName: string;
  AllianceID?: number;
  AllianceName?: string;
  Scopes?: string;
}

/** 授权类型：personal=个人授权（登录/绑定默认），corp=军团授权（个人+军团管理） */
export type AuthScope = 'personal' | 'corp';

/**
 * 个人授权 scope（角色级数据，登录 / 绑定角色默认请求）。
 * 钱包/资产/技能/蓝图/位置/邮件/市场/工业/击杀等。
 */
export const PERSONAL_SCOPES = [
  'esi-wallet.read_character_wallet.v1',
  'esi-assets.read_assets.v1',
  'esi-bookmarks.read_character_bookmarks.v1',
  'esi-calendar.read_calendar_events.v1',
  'esi-calendar.respond_calendar_events.v1',
  'esi-killmails.read_killmails.v1',
  'esi-location.read_location.v1',
  'esi-location.read_online.v1',
  'esi-location.read_ship_type.v1',
  'esi-characters.read_fatigue.v1',
  'esi-characters.read_corporation_roles.v1',
  'esi-characters.read_standings.v1',
  'esi-characters.read_titles.v1',
  'esi-characters.read_agents_research.v1',
  'esi-characters.read_notifications.v1',
  'esi-clones.read_implants.v1',
  'esi-clones.read_clones.v1',
  'esi-skills.read_skills.v1',
  'esi-skills.read_skillqueue.v1',
  'esi-characters.read_loyalty.v1',
  'esi-mail.read_mail.v1',
  'esi-mail.send_mail.v1',
  'esi-universe.read_structures.v1',
  'esi-contracts.read_character_contracts.v1',
  'esi-characters.read_fw_stats.v1',
  'esi-fittings.read_fittings.v1',
  'esi-fittings.write_fittings.v1',
  'esi-fleets.read_fleet.v1',
  'esi-fleets.write_fleet.v1',
  'esi-markets.read_character_orders.v1',
  'esi-markets.structure_markets.v1',
  'esi-ui.write_waypoint.v1',
  'esi-ui.open_window.v1',
  'esi-industry.read_character_jobs.v1',
  'esi-industry.read_character_mining.v1',
  'esi-industry.read_corporation_mining.v1',
  'esi-characters.read_blueprints.v1',
];

/**
 * 军团授权 scope（军团管理级，仅在「军团授权」二次授权链接中追加）。
 * 需要角色具备相应军团职位（Director/CEO 等）才能实际读取数据。
 * 军团授权链接 = 个人授权 scope ∪ 本清单。
 */
export const CORP_SCOPES = [
  'esi-assets.read_corporation_assets.v1',
  'esi-bookmarks.read_corporation_bookmarks.v1',
  'esi-corporations.read_contacts.v1',
  'esi-contracts.read_corporation_contracts.v1',
  'esi-corporations.read_container_logs.v1',
  'esi-corporations.read_divisions.v1',
  'esi-corporations.read_facilities.v1',
  'esi-corporations.read_medals.v1',
  'esi-corporations.read_corporation_membership.v1',
  'esi-corporations.track_members.v1',
  'esi-corporations.read_titles.v1',
  'esi-wallet.read_corporation_wallets.v1',
  'esi-corporations.read_standings.v1',
  'esi-corporations.read_structures.v1',
  'esi-industry.read_corporation_jobs.v1',
  'esi-killmails.read_corporation_killmails.v1',
  'esi-planets.read_customs_offices.v1',
];

/**
 * 国服 ESI 客户端。
 * - 数据接口：https://ali-esi.evepc.163.com （原 esi.evepc.163.com 已迁移）
 * - SSO：https://login.evepc.163.com/v2/oauth/authorize（realm=ESI + device_id）
 * - 国服 SSO 支持一次性携带大量 scope，
 *   未发现"单次最多 4 个"的限制；token 交换仅需 client_id（可选 Basic 带 secret）
 * - 网易官方未开放 client_id 申请渠道，默认使用官方 ESI 网页自带的 client_id
 *   （bc90aa496a404724a93f41b4f4e97761，民间工具/KB网均直接复用），开箱即用；
 *   若官方后续开放申请，可通过 EVE_SSO_CLIENT_ID / EVE_DEVICE_ID 覆盖。
 */
@Injectable()
export class EsiService {
  private readonly logger = new Logger(EsiService.name);
  readonly enabled: boolean;
  readonly esiBase: string;
  readonly ssoBase: string;
  readonly clientId: string;
  readonly clientSecret?: string;
  /** 回调地址：默认国服官方固定页面；若应用允许可配置自有回调 */
  readonly redirectUri: string;
  /** 个人授权 scope（登录/绑定默认请求的角色级 scope） */
  readonly personalScopes: string[];
  /** 军团授权 scope（个人授权基础上追加的军团管理级 scope） */
  readonly corpScopes: string[];
  /** 兼容字段：登录/绑定默认请求的 scope（= personalScopes） */
  readonly scopes: string[];
  readonly gameId: string;
  private deviceId: string | null = null;

  /** 名称缓存（universe/names 批量反查） */
  private nameCache = new Map<number, { name: string; category: string }>();

  private http: AxiosInstance;
  private active = 0;
  private waiters: (() => void)[] = [];
  private readonly maxConcurrent = 3;

  constructor() {
    // 官方无申请渠道：默认复用官方 ESI 网页自带 client_id（第三方工具/KB网均用此 ID）
    const DEFAULT_CLIENT_ID = 'bc90aa496a404724a93f41b4f4e97761';
    const DEFAULT_DEVICE_ID = 'eveman';
    const envClientId = process.env.EVE_SSO_CLIENT_ID;
    this.clientId = envClientId || DEFAULT_CLIENT_ID;
    this.enabled = true;
    this.clientSecret = process.env.EVE_SSO_CLIENT_SECRET;
    this.esiBase = (process.env.EVE_ESI_BASE_URL || 'https://ali-esi.evepc.163.com').replace(/\/+$/, '');
    this.ssoBase = (process.env.EVE_SSO_BASE_URL || 'https://login.evepc.163.com').replace(/\/+$/, '');
    // 回调地址必须与官方 ESI 应用注册值一致（实测官方客户端注册回调为 ali-esi 域名，
    // esi.evepc.163.com 旧值已不被接受——授权后浏览器落在 ali-esi/ui/oauth2-redirect.html）
    this.redirectUri =
      process.env.EVE_SSO_REDIRECT_URI || 'https://ali-esi.evepc.163.com/ui/oauth2-redirect.html';
    this.gameId = process.env.EVE_GAME_ID || 'aecfu6bgiuaaaal2-g-ma79';
    // 内置客户端直接复用device_id；自配客户端时留空，启动时动态初始化
    this.deviceId = process.env.EVE_DEVICE_ID || (envClientId ? null : DEFAULT_DEVICE_ID);
    // 授权 scope 分「个人授权」与「军团授权」两套：
    // - 个人授权（登录/绑定角色默认）：角色级数据 scope（钱包/技能/资产/蓝图/位置/邮件/市场/工业等）
    // - 军团授权（个人中心二次授权）：个人授权 scope + 军团管理 scope，需角色具备对应军团职位
    // EVE_SCOPES 若显式配置则作为个人授权基础清单；EVE_CORP_SCOPES 可覆盖追加的军团 scope。
    const envPersonal = (process.env.EVE_SCOPES || '').split(/\s+/).filter(Boolean);
    this.personalScopes = envPersonal.length ? envPersonal : [...PERSONAL_SCOPES];
    const envCorp = (process.env.EVE_CORP_SCOPES || '').split(/\s+/).filter(Boolean);
    this.corpScopes = envCorp.length ? envCorp : [...CORP_SCOPES];
    this.scopes = this.personalScopes;
    this.logger.log(`EVE SSO scopes：个人 ${this.personalScopes.length} 个 / 军团额外 ${this.corpScopes.length} 个`);

    this.http = axios.create({ timeout: 30000 });
  }

  async onModuleInit() {
    if (this.enabled) {
      try {
        await this.initDeviceId();
      } catch (e) {
        this.logger.warn('初始化 device_id 失败（授权时仍会重试）：' + e.message);
      }
    }
  }

  // ---------------------------------------------------------------- SSO ----

  /** 初始化网易设备 ID（国服 SSO 必需参数） */
  async initDeviceId(): Promise<string> {
    if (this.deviceId) return this.deviceId;
    const url =
      `https://mpay-web.g.mkey.163.com/device/init?game_id=${this.gameId}` +
      `&device_type=PC&system_name=Windows&system_version=10&resolution=1920*1080&device_model=64`;
    const resp = await axios.get(url, {
      headers: { Origin: 'https://esi.evepc.163.com' },
      timeout: 15000,
    });
    this.deviceId = resp.data?.device?.id || null;
    if (!this.deviceId) throw new Error('device/init 未返回 device.id');
    return this.deviceId;
  }

  /**
   * 构建 SSO 授权 URL（response_type=code）。
   * @param kind personal=个人授权（默认，登录/绑定）；corp=军团授权（个人 scope + 军团管理 scope）
   */
  async buildAuthorizeUrl(state: string, kind: AuthScope = 'personal'): Promise<string> {
    const deviceId = await this.initDeviceId();
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.scopesFor(kind).join(' '),
      state,
      realm: 'ESI',
      device_id: deviceId,
    });
    return `${this.ssoBase}/v2/oauth/authorize?${params.toString()}`;
  }

  /** 指定授权类型对应的完整 scope 清单（军团授权 = 个人授权 + 军团管理 scope） */
  scopesFor(kind: AuthScope): string[] {
    if (kind === 'corp') return [...new Set([...this.personalScopes, ...this.corpScopes])];
    return this.personalScopes;
  }

  /** 是否已具备军团管理级授权（含任意军团 scope，即完成军团二次授权） */
  hasCorpAuth(granted?: string | null): boolean {
    return this.classifyScopes(granted).corp;
  }

  /** 依据账号已授予的 scopes 判定个人/军团授权状态（个人中心展示用） */
  classifyScopes(granted?: string | null): { personal: boolean; corp: boolean } {
    const set = new Set((granted || '').split(/\s+/).filter(Boolean));
    const personal = this.personalScopes.some((s) => set.has(s));
    const corp = this.corpScopes.some((s) => set.has(s));
    return { personal, corp };
  }

  /** authorization_code 交换 token（国服仅需 client_id，可选 Basic 带 secret） */
  async exchangeCode(code: string): Promise<TokenPair> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      code,
    });
    return this.tokenRequest(body);
  }

  /** refresh_token 刷新 access token */
  async refreshAccessToken(refreshToken: string): Promise<TokenPair> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      refresh_token: refreshToken,
    });
    return this.tokenRequest(body);
  }

  private async tokenRequest(body: URLSearchParams): Promise<TokenPair> {
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (this.clientSecret) {
      headers.Authorization = 'Basic ' + Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    }
    let resp;
    try {
      resp = await axios.post(`${this.ssoBase}/v2/oauth/token`, body.toString(), { headers, timeout: 30000 });
    } catch (e: any) {
      const d = e?.response?.data || {};
      const desc = d.error_description || d.error || e?.message || '未知错误';
      // invalid_grant 通常是授权 code 已过期（国服 code 有效期很短），提示重新授权
      if (d.error === 'invalid_grant') {
        throw new BadRequestException('授权已过期，请重新点击 SSO 授权并尽快提交（国服授权码有效期很短）');
      }
      throw new BadRequestException(`SSO token 交换失败：${desc}`);
    }
    const d = resp.data;
    return {
      accessToken: d.access_token,
      refreshToken: d.refresh_token || '',
      expiresIn: Number(d.expires_in) || 1200,
      scopes: d.scope || '',
    };
  }

  /** 用 Bearer token 获取角色身份信息 */
  async verify(accessToken: string): Promise<VerifyInfo> {
    const resp = await this.get<any>(`/verify/`, accessToken, undefined, true);
    return (resp?.data || resp) as VerifyInfo;
  }

  // ------------------------------------------------------------ 基础请求 ----

  /** 数据接口统一走 /latest 前缀；verify 属认证接口不带前缀 */
  private urlFor(path: string): string {
    if (path.startsWith('/verify')) return `${this.esiBase}${path}`;
    return `${this.esiBase}/latest${path}`;
  }

  private async acquire() {
    if (this.active < this.maxConcurrent) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active++;
  }

  private release() {
    this.active--;
    const next = this.waiters.shift();
    if (next) next();
  }

  /**
   * GET 请求（带 Bearer、限流、429/5xx 重试）。
   * raw=true 时返回 axios response（用于 /verify/ 这种无分页接口）。
   */
  async get<T = any>(path: string, token?: string, params?: Record<string, any>, raw = false): Promise<T> {
    let lastError: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.acquire();
      try {
        const resp = await this.http.get(this.urlFor(path), {
          params,
          headers: this.langHeaders(token),
        });
        return raw ? (resp as any) : resp.data;
      } catch (e: any) {
        lastError = e;
        const status = e?.response?.status;
        if (status === 429 || status >= 500 || !status) {
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
          continue;
        }
        throw e;
      } finally {
        this.release();
      }
    }
    throw lastError;
  }

  /** 分页拉取全部数据（ESI 使用 X-Pages 约定） */
  async getAll<T = any>(path: string, token?: string, params: Record<string, any> = {}, maxPages = 100): Promise<T[]> {
    const first = await this.getWithHeaders<T[]>(path, token, { ...params, page: 1 });
    const out: T[] = [...(first.data || [])];
    const pages = Number(first.headers?.['x-pages']) || 1;
    const total = Math.min(pages, maxPages);
    for (let p = 2; p <= total; p++) {
      const next = await this.getWithHeaders<T[]>(path, token, { ...params, page: p });
      out.push(...(next.data || []));
    }
    return out;
  }

  private async getWithHeaders<T>(path: string, token?: string, params?: Record<string, any>): Promise<{ data: T; headers: Record<string, any> }> {
    let lastError: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.acquire();
      try {
        const resp = await this.http.get(this.urlFor(path), {
          params,
          headers: this.langHeaders(token),
        });
        return { data: resp.data, headers: resp.headers };
      } catch (e: any) {
        lastError = e;
        const status = e?.response?.status;
        if (status === 429 || status >= 500 || !status) {
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
          continue;
        }
        throw e;
      } finally {
        this.release();
      }
    }
    throw lastError;
  }

  /** 请求头：国服统一请求中文语言（universe 类型/分组/星系/血统等返回汉化名称） */
  private langHeaders(token?: string): Record<string, string> | undefined {
    return token ? { Authorization: `Bearer ${token}`, 'Accept-Language': 'zh' } : { 'Accept-Language': 'zh' };
  }

  /** POST 请求（universe/names 等） */
  async post<T = any>(path: string, body: any, token?: string): Promise<T> {
    await this.acquire();
    try {
      const resp = await this.http.post(this.urlFor(path), body, {
        headers: this.langHeaders(token),
      });
      return resp.data;
    } finally {
      this.release();
    }
  }

  // ------------------------------------------------------------ 名称解析 ----

  /** 批量解析 ID -> 名称（universe/names，最多 1000 个/次） */
  async resolveNames(ids: number[]): Promise<Record<number, { name: string; category: string }>> {
    const unique = [...new Set(ids.filter(Boolean))];
    const result: Record<number, { name: string; category: string }> = {};
    const missing: number[] = [];
    for (const id of unique) {
      if (this.nameCache.has(id)) {
        result[id] = this.nameCache.get(id)!;
      } else {
        missing.push(id);
      }
    }
    for (let i = 0; i < missing.length; i += 1000) {
      const chunk = missing.slice(i, i + 1000);
      try {
        const list = await this.post<any[]>('/universe/names/', chunk);
        for (const item of list || []) {
          const v = { name: item.name, category: item.category };
          result[item.id] = v;
          this.nameCache.set(item.id, v);
        }
      } catch (e) {
        this.logger.warn('universe/names 解析失败: ' + e.message);
      }
    }
    return result;
  }

  async resolveName(id: number): Promise<string> {
    const r = await this.resolveNames([id]);
    return r[id]?.name || `#${id}`;
  }

  // ------------------------------------------------------------ 角色 ESI ----

  getCharacter(characterId: number) {
    return this.get<any>(`/characters/${characterId}/`);
  }
  getCharacterPortrait(characterId: number) {
    return this.get<any>(`/characters/${characterId}/portrait/`);
  }
  getCharacterSkills(characterId: number, token: string) {
    return this.get<any>(`/characters/${characterId}/skills/`, token);
  }
  getCharacterSkillQueue(characterId: number, token: string) {
    return this.get<any[]>(`/characters/${characterId}/skillqueue/`, token);
  }
  getCharacterWallet(characterId: number, token: string) {
    return this.get<number>(`/characters/${characterId}/wallet/`, token);
  }
  getCharacterWalletJournal(characterId: number, token: string) {
    return this.getAll<any>(`/characters/${characterId}/wallet/journal/`, token);
  }
  getCharacterAssets(characterId: number, token: string) {
    return this.getAll<any>(`/characters/${characterId}/assets/`, token);
  }
  getCharacterLocation(characterId: number, token: string) {
    return this.get<any>(`/characters/${characterId}/location/`, token);
  }
  getCharacterShip(characterId: number, token: string) {
    return this.get<any>(`/characters/${characterId}/ship/`, token);
  }
  getCharacterOnline(characterId: number, token: string) {
    return this.get<any>(`/characters/${characterId}/online/`, token);
  }
  getCharacterClones(characterId: number, token: string) {
    return this.get<any>(`/characters/${characterId}/clones/`, token);
  }
  getCharacterLoyalty(characterId: number, token: string) {
    return this.getAll<any>(`/characters/${characterId}/loyalty/points/`, token);
  }
  getCharacterBlueprints(characterId: number, token: string) {
    return this.getAll<any>(`/characters/${characterId}/blueprints/`, token);
  }
  getCharacterIndustryJobs(characterId: number, token: string) {
    return this.getAll<any>(`/characters/${characterId}/industry/jobs/`, token);
  }
  getCharacterCorporationRoles(characterId: number, token: string) {
    return this.getAll<any>(`/characters/${characterId}/corporationroles/`, token);
  }
  getCharacterTitles(characterId: number, token: string) {
    return this.getAll<any>(`/characters/${characterId}/titles/`, token);
  }
  getCharacterFatigue(characterId: number, token: string) {
    return this.get<any>(`/characters/${characterId}/fatigue/`, token);
  }
  getCharacterImplants(characterId: number, token: string) {
    return this.get<any[]>(`/characters/${characterId}/implants/`, token);
  }
  getCharacterChatChannels(characterId: number, token: string) {
    return this.getAll<any>(`/characters/${characterId}/chat_channels/`, token);
  }
  getCharacterFittings(characterId: number, token: string) {
    return this.getAll<any>(`/characters/${characterId}/fittings/`, token);
  }
  getCharacterKillmails(characterId: number, token: string) {
    return this.getAll<any>(`/characters/${characterId}/killmails/recent/`, token);
  }
  getCharacterStandings(characterId: number, token: string) {
    return this.getAll<any>(`/characters/${characterId}/standings/`, token);
  }
  getCharacterContacts(characterId: number, token: string) {
    return this.getAll<any>(`/characters/${characterId}/contacts/`, token);
  }
  getCharacterMedals(characterId: number, token: string) {
    return this.getAll<any>(`/characters/${characterId}/medals/`, token);
  }
  getCharacterBookmarks(characterId: number, token: string) {
    return this.getAll<any>(`/characters/${characterId}/bookmarks/`, token);
  }
  getCharacterSearch(characterId: number, categories: string, search: string, token: string) {
    return this.get<any>(`/characters/${characterId}/search/`, token, { categories, search, strict: true });
  }

  // ------------------------------------------------------------ 军团 ESI ----

  getCorporation(corporationId: number) {
    return this.get<any>(`/corporations/${corporationId}/`);
  }
  getCorporationAllianceHistory(corporationId: number) {
    return this.getAll<any>(`/corporations/${corporationId}/alliance_history/`);
  }
  getCorporationMembers(corporationId: number, token: string) {
    return this.getAll<number>(`/corporations/${corporationId}/members/`, token);
  }
  getCorporationMemberTracking(corporationId: number, token: string) {
    return this.getAll<any>(`/corporations/${corporationId}/membertracking/`, token);
  }
  getCorporationRoles(corporationId: number, token: string) {
    return this.getAll<any>(`/corporations/${corporationId}/roles/`, token);
  }
  getCorporationTitles(corporationId: number, token: string) {
    return this.getAll<any>(`/corporations/${corporationId}/titles/`, token);
  }
  getCorporationWallets(corporationId: number, token: string) {
    return this.getAll<any>(`/corporations/${corporationId}/wallets/`, token);
  }
  getCorporationWalletJournal(corporationId: number, token: string, division = 1) {
    return this.getAll<any>(`/corporations/${corporationId}/wallets/${division}/journal/`, token);
  }
  getCorporationWalletTransactions(corporationId: number, token: string, division = 1) {
    return this.getAll<any>(`/corporations/${corporationId}/wallets/${division}/transactions/`, token);
  }
  getCorporationAssets(corporationId: number, token: string) {
    return this.getAll<any>(`/corporations/${corporationId}/assets/`, token);
  }
  getCorporationBlueprints(corporationId: number, token: string) {
    return this.getAll<any>(`/corporations/${corporationId}/blueprints/`, token);
  }
  getCorporationDivisions(corporationId: number, token: string) {
    return this.get<any>(`/corporations/${corporationId}/divisions/`, token);
  }
  getCorporationStructures(corporationId: number, token: string) {
    return this.getAll<any>(`/corporations/${corporationId}/structures/`, token);
  }
  getCorporationStarbases(corporationId: number, token: string) {
    return this.getAll<any>(`/corporations/${corporationId}/starbases/`, token);
  }
  getCorporationIndustryJobs(corporationId: number, token: string) {
    return this.getAll<any>(`/corporations/${corporationId}/industry/jobs/`, token);
  }
  getCorporationContacts(corporationId: number, token: string) {
    return this.getAll<any>(`/corporations/${corporationId}/contacts/`, token);
  }
  getCorporationStandings(corporationId: number, token: string) {
    return this.getAll<any>(`/corporations/${corporationId}/standings/`, token);
  }
  getCorporationShareholders(corporationId: number, token: string) {
    return this.getAll<any>(`/corporations/${corporationId}/shareholders/`, token);
  }
  getCorporationMedals(corporationId: number, token: string) {
    return this.getAll<any>(`/corporations/${corporationId}/medals/`, token);
  }
  getCorporationCustomOffices(corporationId: number, token: string) {
    return this.getAll<any>(`/corporations/${corporationId}/custom_offices/`, token);
  }
  getCorporationBookmarks(corporationId: number, token: string) {
    return this.getAll<any>(`/corporations/${corporationId}/bookmarks/`, token);
  }
  getCorporationFacilities(corporationId: number, token: string) {
    return this.getAll<any>(`/corporations/${corporationId}/facilities/`, token);
  }
  getCorporationContainersLogs(corporationId: number, token: string) {
    return this.getAll<any>(`/corporations/${corporationId}/containers/logs/`, token);
  }
  getCorporationKillmails(corporationId: number, token: string) {
    return this.getAll<any>(`/corporations/${corporationId}/killmails/recent/`, token);
  }

  // ------------------------------------------------------------ 联盟 ESI ----

  getAlliance(allianceId: number) {
    return this.get<any>(`/alliances/${allianceId}/`);
  }
  getAllianceCorporations(allianceId: number) {
    return this.getAll<number>(`/alliances/${allianceId}/corporations/`);
  }
  getAllianceContacts(allianceId: number, token: string) {
    return this.getAll<any>(`/alliances/${allianceId}/contacts/`, token);
  }
  getAllianceIcons(allianceId: number) {
    return this.get<any>(`/alliances/${allianceId}/icons/`);
  }

  // ------------------------------------------------------------ 宇宙 ESI ----

  postUniverseNames(ids: number[]) {
    return this.post<any[]>(`/universe/names/`, ids);
  }
  postUniverseIds(names: string[]) {
    return this.post<any[]>(`/universe/ids/`, names);
  }
  getUniverseType(typeId: number) {
    return this.get<any>(`/universe/types/${typeId}/`);
  }
  getUniverseGroup(groupId: number) {
    return this.get<any>(`/universe/groups/${groupId}/`);
  }
  getUniverseCategory(categoryId: number) {
    return this.get<any>(`/universe/categories/${categoryId}/`);
  }
  getUniverseSystem(systemId: number) {
    return this.get<any>(`/universe/systems/${systemId}/`);
  }
  getUniverseConstellation(constellationId: number) {
    return this.get<any>(`/universe/constellations/${constellationId}/`);
  }
  getUniverseRegion(regionId: number) {
    return this.get<any>(`/universe/regions/${regionId}/`);
  }
  getUniverseStation(stationId: number) {
    return this.get<any>(`/universe/stations/${stationId}/`);
  }
  getUniverseStructure(structureId: number, token: string) {
    return this.get<any>(`/universe/structures/${structureId}/`, token);
  }
  getUniverseRaces() {
    return this.getAll<any>(`/universe/races/`);
  }
  getUniverseBloodlines() {
    return this.getAll<any>(`/universe/bloodlines/`);
  }
  getUniverseAncestries() {
    return this.getAll<any>(`/universe/ancestries/`);
  }
  getUniverseFactions() {
    return this.getAll<any>(`/universe/factions/`);
  }
  getUniverseMarketGroups() {
    return this.getAll<any>(`/universe/market_groups/`);
  }
  getUniverseSystemKills() {
    return this.getAll<any>(`/universe/system_kills/`);
  }
  getUniverseSystemJumps() {
    return this.getAll<any>(`/universe/system_jumps/`);
  }

  // ------------------------------------------------------------ 市场 ESI ----

  getMarketPrices() {
    return this.getAll<any>(`/markets/prices/`);
  }
  getMarketOrders(regionId: number, typeId?: number) {
    const params: Record<string, any> = { order_type: 'all' };
    if (typeId) params.type_id = typeId;
    return this.getAll<any>(`/markets/${regionId}/orders/`, undefined, params);
  }
  getMarketHistory(regionId: number, typeId: number) {
    return this.getAll<any>(`/markets/${regionId}/history/`, undefined, { type_id: typeId });
  }
  getMarketRegionTypes(regionId: number) {
    return this.getAll<number>(`/markets/${regionId}/types/`);
  }
  getMarketStructureOrders(structureId: number, token: string) {
    return this.getAll<any>(`/markets/structures/${structureId}/`, token);
  }

  /** 获取 killmail（需 hash；公共接口无需 token） */
  getKillmail(killmailId: number, hash?: string) {
    return this.get<any>(`/killmails/${killmailId}/${hash || '1'}/`);
  }

  /** 获取角色最近的 killmail 列表（需 token） */
  getCharacterKillmailsList(characterId: number, token: string) {
    return this.getAll<any>(`/characters/${characterId}/killmails/recent/`, token);
  }

  // ------------------------------------------------------------ 其他 ESI ----

  getStatus() {
    return this.get<any>(`/status/`);
  }
  getInsurancePrices() {
    return this.getAll<any>(`/insurance/prices/`);
  }
  getIndustryFacilities() {
    return this.getAll<any>(`/industry/facilities/`);
  }
  getIndustrySystems() {
    return this.getAll<any>(`/industry/systems/`);
  }
  getIndustryRates() {
    return this.getAll<any>(`/industry/rates/`);
  }
  getRoute(origin: number, destination: number, flag = 'shortest') {
    return this.get<any[]>(`/route/${origin}/${destination}/`, undefined, { flag });
  }
  getSovereigntyMap() {
    return this.getAll<any>(`/sovereignty/map/`);
  }
}
