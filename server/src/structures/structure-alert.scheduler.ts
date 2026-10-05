import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization, OrgType } from '../common/entities/organization.entity';
import { StructureAlertService } from './structure-alert.service';

/** 每小时检查一次所有军团结构，生成燃料/易损窗口提醒 */
@Injectable()
export class StructureAlertScheduler {
  private readonly logger = new Logger(StructureAlertScheduler.name);
  constructor(
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    private readonly alertSvc: StructureAlertService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async checkStructures() {
    const corps = await this.orgs.find({ where: { type: OrgType.CORPORATION, isManaged: true } });
    let total = 0;
    for (const c of corps) {
      try {
        const r = await this.alertSvc.generateAlerts({ corporationId: c.id });
        total += r.generated;
      } catch (e: any) {
        this.logger.warn(`结构提醒生成失败 ${c.name}: ${e.message}`);
      }
    }
    if (total > 0) this.logger.log(`生成结构提醒 ${total} 条`);
  }
}
