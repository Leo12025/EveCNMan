import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../common/entities/user.entity';

/** 舰队与作战：集结 Ping + 登记 + AAR */
export type FleetStatus = 'draft' | 'active' | 'ended';

@Entity('fleets')
export class Fleet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  orgId: number;

  @Column({ type: 'varchar' })
  orgType: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  scheduledAt: Date;

  @Column({ type: 'varchar', default: 'draft' })
  status: FleetStatus;

  /** 目标频道/位置 */
  @Column({ nullable: true })
  location: string;

  /** Ping 推送已发送 */
  @Column({ default: false })
  pingSent: boolean;

  /** Ping 渠道（discord/qq/wechat，逗号分隔） */
  @Column({ type: 'varchar', nullable: true })
  pingChannels: string;

  /** 作战报告 AAR */
  @Column({ type: 'text', nullable: true })
  aar: string;

  @Column({ type: 'integer', nullable: true })
  commanderId: number;

  @ManyToOne(() => User, { nullable: true })
  commander: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
