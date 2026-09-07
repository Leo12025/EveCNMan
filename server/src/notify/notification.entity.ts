import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** 站内信 + 外部推送记录 */
export type NotifyChannel = 'inapp' | 'webhook' | 'discord' | 'qq' | 'wechat';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer', nullable: true })
  userId: number; // 站内信接收用户（null=群发）

  @Column({ type: 'varchar' })
  channel: NotifyChannel;

  @Column()
  title: string;

  @Column({ type: 'text' })
  body: string;

  /** 附加数据 JSON（如 webhook url、跳转） */
  @Column({ type: 'text', nullable: true })
  meta: string;

  @Column({ default: false })
  read: boolean;

  @Column({ default: 'pending' })
  status: 'pending' | 'sent' | 'failed';

  @Column({ type: 'text', nullable: true })
  error: string;

  @CreateDateColumn()
  createdAt: Date;
}
