import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { EsiService } from './esi.service';
import { EsiSyncService } from './esi.sync.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('esi')
export class EsiController {
  constructor(private readonly esi: EsiService, private readonly sync: EsiSyncService) {}

  /** 国服服务器状态（玩家数等） */
  @Get('status')
  status() {
    return this.esi.getStatus();
  }

  /** 同步当前用户绑定的角色（校验归属） */
  @Post('characters/:id/sync')
  syncCharacter(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sync.syncCharacter(Number(id), user.sub);
  }

  /** 角色完整数据视图（钱包/技能/位置/资产等） */
  @Get('characters/:id/data')
  characterData(@Param('id') id: string) {
    return this.sync.characterData(Number(id));
  }

  /** 角色公开档案（无需授权的 ESI 公开信息：头像/出生/种族/安全等级/当前军团等） */
  @Get('characters/:id/profile')
  characterProfile(@Param('id') id: string) {
    return this.sync.characterPublicProfile(Number(id));
  }

  /** 角色快照名称/分类回填（对照表：技能分类、物品/建筑/军团名称），存量快照一键补全 */
  @Post('characters/:id/names/refresh')
  refreshCharacterNames(@Param('id') id: string) {
    return this.sync.refreshSnapshotNames(Number(id));
  }

  /** 同步组织（军团/联盟）数据：管理员可直接同步；成员需对该军团有军团授权角色 */
  @Post('orgs/:id/sync')
  syncOrg(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.sync.syncOrg(Number(id), false, { sub: user.sub, role: user.role });
  }

  /** 同步联盟：拉取其下全部军团并注册 */
  @Post('orgs/:id/sync-alliance')
  @Roles('admin')
  syncAlliance(@Param('id') id: string) {
    return this.sync.syncAlliance(Number(id));
  }

  /** 导入/重建演示数据（未配置真实 ESI 时使用） */
  @Post('seed-demo')
  @Roles('admin')
  seedDemo() {
    return this.sync.seedDemoData();
  }

  /** 清空示例数据（仅删除演示组织及其关联数据） */
  @Post('clear-demo')
  @Roles('admin')
  clearDemo() {
    return this.sync.clearDemoData();
  }

  /** 最近同步日志 */
  @Get('logs')
  logs() {
    return this.sync.recentLogs(20);
  }
}
