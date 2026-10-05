import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { StructureAlert, StructureAlertType } from './structure-alert.entity';
import { Structure } from '../common/entities/structure.entity';

@Injectable()
export class StructureAlertService {
  constructor(
    @InjectRepository(StructureAlert) private readonly alerts: Repository<StructureAlert>,
    @InjectRepository(Structure) private readonly structures: Repository<Structure>,
  ) {}

  /** 生成燃料/易损窗口提醒（幂等：同类结构同类型当天只生成一次） */
  async generateAlerts(filter: { corporationId?: number; allianceId?: number }) {
    const list = await this.structures.find({ where: filter });
    const created: StructureAlert[] = [];
    const orgId = filter.corporationId ?? filter.allianceId ?? 0;
    const today = new Date().toDateString();
    for (const s of list) {
      // 燃料不足（<24 小时提醒，<6 小时严重）
      if (s.fuelExpiresHours != null && s.fuelExpiresHours <= 24) {
        const exists = await this.alerts
          .createQueryBuilder('a')
          .where(`a.structureId = :sid AND a.type = 'fuel-low' AND date(a.createdAt) = date('now')`, { sid: s.id })
          .getOne();
        if (!exists) {
          const severity = s.fuelExpiresHours <= 6 ? 'critical' : 'warning';
          const a = await this.alerts.save(
            this.alerts.create({
              structureId: Number(s.id),
              orgId,
              type: 'fuel-low',
              message: `结构 ${s.typeName || s.id}（${s.systemName || ''}）燃料仅剩 ${s.fuelExpiresHours} 小时，请及时补给`,
              severity,
              channels: 'discord,wechat,inapp',
            }),
          );
          created.push(a);
        }
      }
      // 易损窗口临近（30 分钟内开启）
      if (s.nextVulnerableStart) {
        const start = new Date(s.nextVulnerableStart);
        const minutes = (start.getTime() - Date.now()) / 60000;
        if (minutes > 0 && minutes <= 30) {
          const exists = await this.alerts
            .createQueryBuilder('a')
            .where(`a.structureId = :sid AND a.type = 'vulnerable' AND date(a.createdAt) = date('now')`, { sid: s.id })
            .getOne();
          if (!exists) {
            const a = await this.alerts.save(
              this.alerts.create({
                structureId: Number(s.id),
                orgId,
                type: 'vulnerable',
                message: `结构 ${s.typeName || s.id}（${s.systemName || ''}）将于 ${start.toLocaleString()} 进入易损窗口`,
                severity: 'warning',
                channels: 'inapp',
              }),
            );
            created.push(a);
          }
        }
      }
    }
    return { generated: created.length, alerts: created };
  }

  /** 手动创建一条结构告警（如权限变更通知） */
  async create(
    structureId: string,
    type: string,
    title: string,
    message: string,
    orgId?: number,
    severity: 'info' | 'warning' | 'critical' = 'warning',
  ) {
    const a = await this.alerts.save(
      this.alerts.create({
        structureId: Number(structureId),
        orgId: orgId ?? 0,
        type: type as StructureAlertType,
        title,
        message,
        severity,
        channels: 'inapp',
      }),
    );
    return a;
  }

  list(corporationId?: number, limit = 50) {    const qb = this.alerts.createQueryBuilder('a').orderBy('a.createdAt', 'DESC').take(limit);
    if (corporationId) qb.andWhere('a.orgId = :o', { o: corporationId });
    return qb.getMany();
  }

  async resolve(id: number) {
    return this.alerts.update(id, { resolved: true });
  }
}
