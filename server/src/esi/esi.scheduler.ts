import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository, IsNull, Not } from 'typeorm';
import { EveAccount } from '../common/entities/eve-account.entity';
import { Organization, OrgType } from '../common/entities/organization.entity';
import { EsiSyncService } from './esi.sync.service';

/**
 * 定时任务：
 * - 每 10 分钟刷新临近过期的 access token
 * - 每小时自动同步一次已绑定角色与已管理军团
 */
@Injectable()
export class EsiSchedulerService {
  private readonly logger = new Logger(EsiSchedulerService.name);
  private syncing = false;

  constructor(
    @InjectRepository(EveAccount) private readonly accounts: Repository<EveAccount>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    private readonly sync: EsiSyncService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async refreshTokens() {
    const now = Date.now();
    const soon = new Date(now + 10 * 60 * 1000);
    const accounts = await this.accounts
      .createQueryBuilder('a')
      .where('a.refreshToken IS NOT NULL')
      .andWhere('(a.tokenExpiresAt IS NULL OR a.tokenExpiresAt < :soon)', { soon })
      .getMany();
    for (const a of accounts) {
      try {
        const pair = await this.sync.refreshAccountToken(a);
        this.logger.log(`刷新 token 成功: ${a.characterName}`);
      } catch (e: any) {
        this.logger.warn(`刷新 token 失败 ${a.characterName}: ${e.message}`);
      }
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async autoSync() {
    if (this.syncing) return;
    // 默认部署复用内置官方 client_id（无需配置 EVE_SSO_CLIENT_ID），因此以
    // “是否存在真实 SSO 绑定账号”判断是否进入真实同步；纯演示环境则跳过，
    // 避免对不存在的军团/联盟反复发起真实 ESI 请求。
    const realCount = await this.accounts
      .createQueryBuilder('a')
      .where("a.refreshToken IS NOT NULL AND a.refreshToken != ''")
      .getCount();
    if (realCount === 0) return;
    this.syncing = true;
    try {
      const accounts = await this.accounts.find({ where: { accessToken: Not(IsNull()) } });
      for (const a of accounts) {
        try {
          await this.sync.syncCharacter(a.id);
        } catch (e: any) {
          this.logger.warn(`自动同步角色失败 ${a.characterName}: ${e.message}`);
        }
      }
      const corps = await this.orgs.find({ where: { type: OrgType.CORPORATION, isManaged: true } });
      for (const c of corps) {
        try {
          await this.sync.syncOrg(c.id);
        } catch (e: any) {
          this.logger.warn(`自动同步军团失败 ${c.name}: ${e.message}`);
        }
      }
      const alliances = await this.orgs.find({ where: { type: OrgType.ALLIANCE, isManaged: true } });
      for (const al of alliances) {
        try {
          await this.sync.syncAlliance(al.id);
        } catch (e: any) {
          this.logger.warn(`自动同步联盟失败 ${al.name}: ${e.message}`);
        }
      }
    } finally {
      this.syncing = false;
    }
  }
}
