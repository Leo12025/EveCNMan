import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MembersService } from './members.service';

/** 每日凌晨重算成员活跃度分级 */
@Injectable()
export class MembersScheduler {
  private readonly logger = new Logger(MembersScheduler.name);
  constructor(private readonly members: MembersService) {}

  @Cron('0 0 3 * * *')
  async recomputeTiers() {
    try {
      const r = await this.members.recomputeTiers();
      this.logger.log(`活跃度分级重算: 扫描 ${r.scanned}, 变更 ${r.changed}`);
    } catch (e: any) {
      this.logger.warn(`活跃度分级重算失败: ${e.message}`);
    }
  }
}
