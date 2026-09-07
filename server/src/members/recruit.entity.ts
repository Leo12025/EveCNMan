import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../common/entities/user.entity';

/** 入团申请：提交 -> 审核 -> 通过后发合同/加团 */
export type RecruitStatus = 'pending' | 'approved' | 'rejected' | 'joined';

@Entity('recruits')
export class Recruit {
  @PrimaryGeneratedColumn()
  id: number;

  /** 申请人 EVE 角色 ID（可先填拟用角色名） */
  @Column()
  characterName: string;

  @Column({ nullable: true })
  characterId: number;

  /** 申请加入的组织 */
  @Column()
  orgId: number;

  @Column({ nullable: true })
  orgType: string;

  /** 申请理由 */
  @Column({ type: 'text', nullable: true })
  reason: string;

  /** 来源（招新表单/手动） */
  @Column({ default: 'form' })
  source: string;

  /** 申请人联系方式（QQ/微信/Discord） */
  @Column({ nullable: true })
  contact: string;

  /** 门槛校验结果（SP/技能/安全等级自动比对） */
  @Column({ type: 'text', nullable: true })
  gateResult: string; // JSON

  @Column({ default: 'pending' })
  status: RecruitStatus;

  /** 审核人 */
  @ManyToOne(() => User, { nullable: true })
  reviewer: User;

  @Column({ type: 'text', nullable: true })
  reviewNote: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
