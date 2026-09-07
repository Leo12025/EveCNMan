import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { OrgType } from './organization.entity';

/** 角色 ↔ 组织 的成员关系。一个角色可同时属于多个组织（跨联盟混编）。 */
@Entity('memberships')
@Unique(['characterId', 'orgId'])
export class Membership {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  characterId: number;

  @Column({ type: 'varchar' })
  orgType: OrgType;

  @Column({ type: 'integer' })
  orgId: number;

  @Column({ type: 'text', nullable: true })
  characterName: string;

  /** 管理备注（如分工、职责说明） */
  @Column({ type: 'text', nullable: true })
  note: string;

  /** 标记（如：核心成员 / 离职 / 新人，JSON 数组字符串） */
  @Column({ type: 'text', nullable: true })
  tags: string;

  @Column({ type: 'integer', nullable: true })
  sp: number;

  @Column({ type: 'real', nullable: true })
  securityStatus: number;

  @Column({ nullable: true })
  lastLogin: Date;

  /** 成员当前所在位置（成员追踪同步所得） */
  @Column({ type: 'text', nullable: true })
  locationName: string;

  /** 当月贡献军税 */
  @Column({ type: 'real', default: 0 })
  monthlyTax: number;

  @Column({ default: true })
  isActive: boolean;

  /** 军团角色（JSON 数组字符串） */
  @Column({ type: 'text', nullable: true })
  roles: string;

  @Column({ nullable: true })
  joinedAt: Date;

  /** 活跃度分级：core(核心)/active(活跃)/casual(休闲)/idle(休眠)/left(已离) */
  @Column({ type: 'varchar', default: 'active' })
  activityTier: string;

  /** 最近一次活跃（任何同步/操作的最后时间），用于活跃度自动分级 */
  @Column({ nullable: true })
  lastActivityAt: Date;

  /** 离职/踢出追踪 */
  @Column({ type: 'text', nullable: true })
  leaveReason: string;

  @Column({ nullable: true })
  leftAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
