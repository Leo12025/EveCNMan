import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../common/entities/user.entity';

/** SRP 战场损失报销：killmail 导入 -> 规则校验 -> 申请 -> 审核 -> 打款 */
export type SrpStatus = 'pending' | 'approved' | 'rejected' | 'paid';

@Entity('srp_claims')
export class SrpClaim {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  orgId: number;

  @Column({ type: 'varchar' })
  orgType: string;

  /** 申请人角色 */
  @Column({ type: 'integer' })
  characterId: number;

  @Column({ nullable: true })
  characterName: string;

  /** zKillboard killmail ID */
  @Column({ type: 'bigint' })
  killmailId: number;

  @Column({ type: 'integer' })
  killmailHash: number;

  /** 船只类型 */
  @Column({ type: 'integer', nullable: true })
  shipTypeId: number;

  @Column({ nullable: true })
  shipName: string;

  /** 损失估算（ISK） */
  @Column({ type: 'real', default: 0 })
  lossValue: number;

  /** 报销比例（规则配置） */
  @Column({ type: 'real', default: 0 })
  payoutRatio: number;

  /** 应报销金额 */
  @Column({ type: 'real', default: 0 })
  payout: number;

  @Column({ type: 'text', nullable: true })
  killmailJson: string;

  @Column({ type: 'varchar', default: 'pending' })
  status: SrpStatus;

  @Column({ type: 'text', nullable: true })
  rejectReason: string;

  @ManyToOne(() => User, { nullable: true })
  reviewer: User;

  @Column({ nullable: true })
  payoutRef: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
