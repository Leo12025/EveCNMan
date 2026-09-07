import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** 外部通知渠道配置：Discord/QQ/微信 Webhook 地址 */
@Entity('notify_configs')
export class NotifyConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  type: 'discord' | 'qq' | 'wechat' | 'slack';

  @Column()
  name: string;

  @Column({ type: 'text' })
  url: string;

  @Column({ default: true })
  enabled: boolean;

  /** 触发的事件（逗号分隔）：tax,srp,ping,structure,recruit */
  @Column({ type: 'varchar', default: '*' })
  events: string;
}
