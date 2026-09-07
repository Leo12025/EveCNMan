import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotifyChannel } from './notification.entity';
import { NotifyConfig } from './notify-config.entity';

@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name);

  constructor(
    @InjectRepository(Notification) private readonly notes: Repository<Notification>,
    @InjectRepository(NotifyConfig) private readonly configs: Repository<NotifyConfig>,
  ) {}

  /** 推送：写入站内信 + 异步投递外部 webhook */
  async push(opts: {
    title: string;
    body: string;
    channel?: NotifyChannel;
    userId?: number;
    event?: string;
    meta?: Record<string, any>;
  }) {
    const note = await this.notes.save(
      this.notes.create({
        userId: opts.userId,
        channel: opts.channel || 'inapp',
        title: opts.title,
        body: opts.body,
        meta: opts.meta ? JSON.stringify(opts.meta) : null,
        status: 'pending',
      }),
    );
    if (opts.channel && opts.channel !== 'inapp') {
      await this.dispatchExternal(note, opts.event, opts.meta);
    } else {
      note.status = 'sent';
      await this.notes.save(note);
    }
    return note;
  }

  /** 根据事件匹配启用的 webhook 配置并投递 */
  async dispatchExternal(note: Notification, event?: string, meta?: Record<string, any>) {
    const enabled = await this.configs.find({ where: { enabled: true } });
    const matched = enabled.filter((c) => c.events === '*' || (event && c.events.split(',').includes(event)));
    let sent = false;
    for (const cfg of matched) {
      try {
        const payload = this.buildPayload(cfg.type, note, meta);
        const res = await fetch(cfg.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) sent = true;
        else this.logger.warn(`webhook ${cfg.name} 投递失败: ${res.status}`);
      } catch (e: any) {
        this.logger.warn(`webhook ${cfg.name} 异常: ${e?.message}`);
      }
    }
    note.status = sent ? 'sent' : 'failed';
    note.error = sent ? null : 'no channel delivered';
    await this.notes.save(note);
    return sent;
  }

  private buildPayload(type: string, note: Notification, meta?: Record<string, any>) {
    const text = `**${note.title}**\n${note.body}`;
    if (type === 'discord') return { content: text, embeds: meta ? [{ description: JSON.stringify(meta).slice(0, 1000) }] : [] };
    if (type === 'qq') return { msg_type: 'text', content: { text } };
    if (type === 'wechat') return { msgtype: 'text', text: { content: text } };
    return { text };
  }

  list(userId?: number, page = 1, pageSize = 50) {
    const qb = this.notes.createQueryBuilder('n').orderBy('n.createdAt', 'DESC');
    if (userId) qb.andWhere('n.userId = :u OR n.userId IS NULL', { u: userId });
    qb.skip((page - 1) * pageSize).take(pageSize);
    return qb.getManyAndCount();
  }

  markRead(id: number) {
    return this.notes.update(id, { read: true });
  }

  listConfigs() {
    return this.configs.find();
  }

  upsertConfig(body: any) {
    if (body.id) return this.configs.save({ ...body });
    return this.configs.save(this.configs.create(body));
  }

  removeConfig(id: number) {
    return this.configs.delete(id);
  }
}
