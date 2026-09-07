import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Fleet } from './fleet.entity';
import { FleetSignup } from './fleet-signup.entity';
import { NotifyService } from '../notify/notify.service';

@Injectable()
export class FleetService {
  constructor(
    @InjectRepository(Fleet) private readonly fleets: Repository<Fleet>,
    @InjectRepository(FleetSignup) private readonly signups: Repository<FleetSignup>,
    private readonly notify: NotifyService,
  ) {}

  create(dto: Partial<Fleet>) {
    return this.fleets.save(this.fleets.create({ ...dto, status: dto.status || 'draft' }));
  }

  list(query: { orgId?: number; status?: string }) {
    const qb = this.fleets.createQueryBuilder('f').orderBy('f.scheduledAt', 'DESC');
    if (query.orgId) qb.andWhere('f.orgId = :o', { o: query.orgId });
    if (query.status) qb.andWhere('f.status = :s', { s: query.status });
    return qb.getMany();
  }

  async detail(id: number) {
    const f = await this.fleets.findOne({ where: { id } });
    if (!f) throw new NotFoundException('舰队不存在');
    const members = await this.signups.find({ where: { fleetId: id } });
    return { ...f, members };
  }

  async update(id: number, patch: Partial<Fleet>) {
    const f = await this.fleets.findOne({ where: { id } });
    if (!f) throw new NotFoundException('舰队不存在');
    Object.assign(f, patch);
    return this.fleets.save(f);
  }

  /** 集结 Ping：标记已发送并触发外部渠道推送 */
  async sendPing(id: number, channels: string) {
    const f = await this.fleets.findOne({ where: { id } });
    if (!f) throw new NotFoundException('舰队不存在');
    f.pingSent = true;
    f.pingChannels = channels;
    f.status = 'active';
    const saved = await this.fleets.save(f);
    const when = f.scheduledAt ? new Date(f.scheduledAt).toLocaleString('zh-CN') : '尽快';
    const body = `【${f.title}】集结令已发布！时间：${when}\n地点：${f.location || '待定'}\n备注：${f.description || '无'}`;
    try {
      await this.notify.push({
        title: `集结 Ping：${f.title}`,
        body,
        channel: 'inapp',
        event: 'ping',
        meta: { fleetId: id, channels },
      });
      // 按用户选择的外部渠道推送到 webhook
      for (const ch of (channels || '').split(',').filter(Boolean)) {
        await this.notify.push({ title: `集结 Ping：${f.title}`, body, channel: ch as any, event: 'ping', meta: { fleetId: id } });
      }
    } catch (e) {
      // 通知失败不影响主线
    }
    return saved;
  }

  signup(dto: { fleetId: number; characterId: number; characterName?: string; role?: string }) {
    return this.signups.save(this.signups.create(dto));
  }

  async setAttendance(id: number, attended: boolean) {
    return this.signups.update(id, { attended });
  }

  /** 参与度与奖金统计 */
  async participationStats(orgId: number) {
    const raw = await this.signups
      .createQueryBuilder('s')
      .select('s.characterId', 'characterId')
      .addSelect('s.characterName', 'characterName')
      .addSelect('COUNT(*)', 'fleets')
      .addSelect('SUM(CASE WHEN s.attended = 1 THEN 1 ELSE 0 END)', 'attended')
      .innerJoin(Fleet, 'f', 'f.id = s.fleetId')
      .where('f.orgId = :o', { o: orgId })
      .groupBy('s.characterId, s.characterName')
      .orderBy('attended', 'DESC')
      .getRawMany();
    return raw;
  }
}
