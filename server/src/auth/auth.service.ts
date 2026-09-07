import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../common/entities/user.entity';
import { EveAccount } from '../common/entities/eve-account.entity';
import { EsiService, type TokenPair, type VerifyInfo, type AuthScope } from '../esi/esi.service';
import { EsiSyncService } from '../esi/esi.sync.service';
import { verifyPassword } from './password.util';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private readonly esi: EsiService,
    private readonly jwt: JwtService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(EveAccount) private readonly accounts: Repository<EveAccount>,
    private readonly sync: EsiSyncService,
  ) {}

  get clientId(): string {
    return this.esi.clientId;
  }

  get allowMock(): boolean {
    return process.env.ALLOW_MOCK_LOGIN !== 'false';
  }

  get scopes(): string[] {
    return this.esi.scopes;
  }

  /** 个人授权 scope（登录/绑定默认） */
  get personalScopes(): string[] {
    return this.esi.personalScopes;
  }

  /** 军团授权 scope（军团管理额外授权） */
  get corpScopes(): string[] {
    return this.esi.corpScopes;
  }

  get ssoConfigured(): boolean {
    return this.esi.enabled;
  }

  /** 是否使用内置的官方 ESI 网页自带 client_id（网易未开放申请渠道，第三方工具均复用） */
  get defaultClient(): boolean {
    return !process.env.EVE_SSO_CLIENT_ID;
  }

  /** 生成 EVE 国服 SSO 授权地址（personal=个人授权，corp=军团授权） */
  buildAuthorizeUrl(state: string, kind: AuthScope = 'personal') {
    return this.esi.buildAuthorizeUrl(state, kind);
  }

  /** 用授权码换取 token */
  exchangeCode(code: string) {
    return this.esi.exchangeCode(code);
  }

  /** 校验 access token 获取角色信息 */
  verifyCharacter(accessToken: string): Promise<VerifyInfo> {
    return this.esi.verify(accessToken);
  }

  /** 拉取角色头像（国服图床） */
  async fetchAvatar(characterId: number): Promise<string> {
    return `https://images.evepc.163.com/Character/${characterId}_128.jpg`;
  }

  /** 解析 oauth2-redirect 回调 URL 中的 code（用户粘贴授权后地址） */
  extractCodeFromUrl(rawUrl: string): string {
    try {
      const u = new URL(rawUrl.trim());
      const code = u.searchParams.get('code');
      if (!code) throw new Error('no code');
      return code;
    } catch {
      throw new BadRequestException('未能在地址中找到 code 参数，请确认粘贴的是授权完成后浏览器地址栏的完整 URL');
    }
  }

  /**
   * 某身份主体的「名下 EVE 账号集合」：
   * - 平台账号：名下聚合(platformUser=自己) + 旧数据直接归属(user=自己且自己是平台)的账号并集；
   * - EVE 角色身份：自己身份的账号(user=自己)。
   * 两种身份都取并集即可天然满足「平台账号=旗下角色权限并集 / 角色=自身权限」。
   */
  private async scopeAccounts(userId: number): Promise<EveAccount[]> {
    return this.accounts.find({
      where: [{ user: { id: userId } }, { platformUser: { id: userId } }],
      order: { id: 'ASC' },
    });
  }

  /** 确保某角色的独立身份用户存在（username = eve:<角色ID>，kind=eve） */
  private async ensureIdentityUser(characterId: number): Promise<User> {
    let identity = await this.users.findOne({ where: { username: `eve:${characterId}` } });
    if (!identity) {
      identity = await this.users.save(this.users.create({ username: `eve:${characterId}`, kind: 'eve', role: 'member' }));
    }
    return identity;
  }

  /** 角色授权资料与 token 写入/合并（不改变 user / platformUser 归属） */
  private async fillAccountTokens(account: EveAccount, verify: VerifyInfo, tokens: TokenPair): Promise<EveAccount> {
    return this.accounts.save(
      this.accounts.merge(account, {
        characterName: verify.CharacterName,
        corporationId: verify.CorporationID ?? null,
        corporationName: verify.CorporationName ?? null,
        allianceId: verify.AllianceID ?? null,
        allianceName: verify.AllianceName ?? null,
        avatarUrl: await this.fetchAvatar(verify.CharacterID),
        scopes: tokens.scopes || verify.Scopes || null,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        lastSyncedAt: null,
      }),
    );
  }

  /** 新建角色的账号（user 恒为独立身份，platformUser 为其归属的平台账号，可为 null） */
  private async createAccount(verify: VerifyInfo, tokens: TokenPair, user: User, platformUser: User | null): Promise<EveAccount> {
    return this.accounts.save(
      this.accounts.create({
        user,
        platformUser,
        characterId: verify.CharacterID,
        characterName: verify.CharacterName,
        corporationId: verify.CorporationID ?? null,
        corporationName: verify.CorporationName ?? null,
        allianceId: verify.AllianceID ?? null,
        allianceName: verify.AllianceName ?? null,
        avatarUrl: await this.fetchAvatar(verify.CharacterID),
        scopes: tokens.scopes || verify.Scopes || null,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        lastSyncedAt: null,
        isMain: !platformUser,
      }),
    );
  }

  /** 登录/绑定成功后自动带出角色所属军团/联盟组织（异步，不影响响应） */
  private fireEnsureAccountOrgs(account: EveAccount) {
    this.sync
      .ensureAccountOrgs(account)
      .then((r) => {
        if (r.created) this.logger.log(`角色 ${account.characterName} 自动创建 ${r.created} 个组织（军团/联盟）`);
      })
      .catch((e) => this.logger.warn(`角色 ${account.characterName} 自动带出军团失败: ${e?.message}`));
  }

  /**
   * EVE SSO 授权回调核心（登录 / 绑定 / 重新授权共用）。
   * 无论该角色是否已归属某个平台账号，其会话身份恒为该角色自身的独立身份
   * （users.username = eve:<角色ID>，kind=eve），只拥有该角色的权限。
   */
  async loginWithCharacter(verify: VerifyInfo, tokens: TokenPair) {
    let account = await this.accounts.findOne({
      where: { characterId: verify.CharacterID },
      relations: ['user', 'platformUser'],
    });

    let platformOwner = account?.platformUser ?? null;
    let identity: User | null = null;

    if (account?.user && account.user.kind !== 'platform') {
      // 已有独立身份（新模型 eve:<id>，或旧模型单角色用户）
      identity = account.user;
    } else if (account?.user?.kind === 'platform') {
      // 旧数据兼容：账号直接挂在平台账号下 → 拆出独立身份，平台归属改记 platformUser，二者并存
      platformOwner = account.user;
    }

    if (!identity) identity = await this.ensureIdentityUser(verify.CharacterID);

    if (account) {
      account = await this.fillAccountTokens(account, verify, tokens);
      if (account.user?.id !== identity.id || account.platformUser?.id !== platformOwner?.id) {
        account = await this.accounts.save(this.accounts.merge(account, { user: identity, platformUser: platformOwner }));
      }
    } else {
      account = await this.createAccount(verify, tokens, identity, platformOwner);
    }

    this.fireEnsureAccountOrgs(account);

    return this.sign(identity);
  }

  /**
   * 绑定 / 重新授权角色（当前登录用户视角）：
   * - 重新授权：操作的角色本就在自己名下（自己的身份 或 名下聚合），只刷新 token/scope，归属不变；
   * - 新绑定 / 纳入名下：仅平台账号可以把角色纳入名下（聚合并集）；EVE 角色身份只能管理自身角色。
   */
  /** 解析账号归属：owner=平台归属账号（null 表示未被平台聚合），identity=角色独立身份 */
  private async parseAccountOwnership(
    account: EveAccount,
  ): Promise<{ owner: User | null; identity: User | null }> {
    if (!account.user) return { owner: null, identity: null };
    if (account.user.kind === 'platform') {
      // 旧数据：角色账号直接挂在平台账号下（该平台即其归属，角色身份待归位）
      return { owner: account.platformUser ?? account.user, identity: null };
    }
    return { owner: account.platformUser ?? null, identity: account.user };
  }

  async bindCharacterToUser(userId: number, rawUrl: string) {
    if (!this.esi.enabled) throw new BadRequestException('未配置 EVE_SSO_CLIENT_ID，无法绑定角色');
    const code = this.extractCodeFromUrl(rawUrl);
    const tokens = await this.esi.exchangeCode(code);
    const verify = await this.esi.verify(tokens.accessToken);

    const actor = await this.users.findOne({ where: { id: userId } });
    if (!actor) throw new UnauthorizedException('用户不存在');

    let account = await this.accounts.findOne({
      where: { characterId: verify.CharacterID },
      relations: ['user', 'platformUser'],
    });

    if (account) {
      const { owner, identity } = await this.parseAccountOwnership(account);
      const isMyIdentity = identity?.id === actor.id;
      const boundToMe = owner?.id === actor.id;

      if (isMyIdentity || boundToMe) {
        // 重新授权 / 升级 scope（个人→军团）：更新 token，归属不变
        account = await this.fillAccountTokens(account, verify, tokens);
        if (account.user?.kind === 'platform') {
          // 旧模型直接归属的角色账号：归位独立身份，平台归属记回 platformUser
          const roleIdentity = await this.ensureIdentityUser(verify.CharacterID);
          account = await this.accounts.save(
            this.accounts.merge(account, { user: roleIdentity, platformUser: actor }),
          );
        }
      } else if (owner) {
        throw new BadRequestException(`角色「${verify.CharacterName}」已绑定到其他平台账号，请先由对应账号解绑`);
      } else if (actor.kind === 'platform') {
        // 平台账号把已存在的独立角色纳入名下（聚合并集）
        account = await this.fillAccountTokens(account, verify, tokens);
        account = await this.accounts.save(this.accounts.merge(account, { platformUser: actor }));
      } else {
        throw new BadRequestException('当前为 EVE 角色身份，只能管理自身角色；如需把多个角色聚合到一个账号，请使用平台账号登录');
      }
    } else {
      if (actor.kind !== 'platform') {
        throw new BadRequestException('当前为 EVE 角色身份，只能管理自身角色；如需把多个角色聚合到一个账号，请使用平台账号登录');
      }
      const identity = await this.ensureIdentityUser(verify.CharacterID);
      account = await this.createAccount(verify, tokens, identity, actor);
    }

    this.fireEnsureAccountOrgs(account);
    return this.me(userId);
  }

  /**
   * 未登录 SSO 登录：弹窗授权完成后，用户粘贴回调 URL 到登录页即可完成登录。
   * 按角色 upsert 用户与账号，返回平台 JWT。
   */
  async ssoLogin(rawUrl: string): Promise<{ token: string; user: any }> {
    if (!this.esi.enabled) throw new BadRequestException('未配置 EVE_SSO_CLIENT_ID，无法使用 SSO 登录');
    const code = this.extractCodeFromUrl(rawUrl);
    const tokens = await this.esi.exchangeCode(code);
    const verify = await this.esi.verify(tokens.accessToken);
    const token = await this.loginWithCharacter(verify, tokens);
    const payload = this.jwt.decode(token) as { sub: number };
    return { token, user: await this.me(payload.sub) };
  }

  /** 校验账号归属：账号是自己身份 或 是自己名下聚合的角色 */
  private canOperateAccount(account: EveAccount, userId: number): boolean {
    return account.user?.id === userId || account.platformUser?.id === userId;
  }

  /** 解绑角色 */
  async unbindAccount(userId: number, accountId: number) {
    const account = await this.accounts.findOne({ where: { id: accountId }, relations: ['user', 'platformUser'] });
    if (!account || !this.canOperateAccount(account, userId)) {
      throw new BadRequestException('账号不存在或无权操作');
    }
    if (account.user?.id !== userId && account.platformUser?.id === userId) {
      // 平台账号解绑：仅摘除名下聚合，保留该角色的独立身份与 token
      account.platformUser = null;
      await this.accounts.save(account);
    } else {
      // 角色自身的会话删除该角色（含 token）
      await this.accounts.delete(account.id);
    }
    return { ok: true };
  }

  /** 手动刷新某角色的 token */
  async refreshAccountTokenById(userId: number, accountId: number) {
    const account = await this.accounts.findOne({ where: { id: accountId }, relations: ['user', 'platformUser'] });
    if (!account || !this.canOperateAccount(account, userId)) throw new BadRequestException('账号不存在或无权操作');
    if (!account.refreshToken) throw new BadRequestException('该账号无 refresh_token，需重新授权');
    const refreshed = await this.esi.refreshAccessToken(account.refreshToken);
    account.accessToken = refreshed.accessToken;
    if (refreshed.refreshToken) account.refreshToken = refreshed.refreshToken;
    account.tokenExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);
    if (refreshed.scopes) account.scopes = refreshed.scopes;
    await this.accounts.save(account);
    return { ok: true, expiresAt: account.tokenExpiresAt };
  }

  /** 当前用户角色列表（含 token 状态）：平台账号为名下聚合角色的并集 */
  async accountsOf(userId: number) {
    const accounts = await this.scopeAccounts(userId);
    const now = Date.now();
    return accounts.map((a) => ({
      id: a.id,
      characterId: a.characterId,
      characterName: a.characterName,
      corporationId: a.corporationId,
      corporationName: a.corporationName,
      allianceId: a.allianceId,
      allianceName: a.allianceName,
      avatarUrl: a.avatarUrl,
      scopes: a.scopes || '',
      isMain: a.isMain,
      auth: this.esi.classifyScopes(a.scopes),
      tokenExpired: !a.tokenExpiresAt || a.tokenExpiresAt.getTime() < now,
      lastSyncedAt: a.lastSyncedAt,
      createdAt: a.createdAt,
    }));
  }

  /** 平台账号登录（用户名 + 密码） */
  async loginWithPassword(username: string, password: string): Promise<{ token: string; user: any }> {
    const name = (username || '').trim();
    if (!name || !password) throw new BadRequestException('请输入用户名与密码');
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.username = :username', { username: name })
      .getOne();
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    if (!user.isActive) throw new UnauthorizedException('账号已停用，请联系管理员');
    const token = this.sign(user);
    return { token, user: await this.me(user.id) };
  }

  /** 演示登录（未配置 SSO 时用于本地体验）；演示账号为平台账号，可聚合多个角色 */
  async mockLogin(username: string): Promise<{ token: string; user: any }> {
    if (!this.allowMock) throw new BadRequestException('演示登录已关闭');
    const name = (username || '演示管理员').trim() || '演示管理员';
    let user = await this.users.findOne({ where: { username: name } });
    if (!user) {
      user = await this.users.save(
        this.users.create({
          username: name,
          kind: 'platform',
          role: name.includes('管理员') || name.includes('admin') ? 'admin' : 'member',
        }),
      );
    } else if (user.kind !== 'platform' && !user.username.startsWith('eve:')) {
      // 旧演示账号补标为平台账号（非 EVE 角色身份）
      user.kind = 'platform';
      user = await this.users.save(user);
    }
    const token = this.sign(user);
    return { token, user: await this.me(user.id) };
  }

  sign(user: User): string {
    return this.jwt.sign({ sub: user.id, username: user.username, role: user.role });
  }

  /** 当前用户信息：平台账号返回名下聚合角色并集，EVE 角色身份返回自身角色 */
  async me(userId: number) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('用户不存在');
    const accounts = await this.scopeAccounts(userId);
    return {
      ...user,
      eveAccounts: accounts.map((a) => ({
        id: a.id,
        characterId: a.characterId,
        characterName: a.characterName,
        corporationId: a.corporationId,
        corporationName: a.corporationName,
        allianceId: a.allianceId,
        allianceName: a.allianceName,
        avatarUrl: a.avatarUrl,
        scopes: a.scopes,
        isMain: a.isMain,
        auth: this.esi.classifyScopes(a.scopes),
        lastSyncedAt: a.lastSyncedAt,
      })),
    };
  }
}
