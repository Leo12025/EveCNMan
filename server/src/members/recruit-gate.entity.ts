import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** 入团门槛配置（按组织）：SP 下限、安全等级下限、必备技能（typeId 列表） */
@Entity('recruit_gates')
export class RecruitGate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  orgId: number;

  @Column({ type: 'varchar' })
  orgType: string;

  /** 最低 SP */
  @Column({ type: 'integer', default: 0 })
  minSp: number;

  /** 最低安全等级 */
  @Column({ type: 'real', default: -10 })
  minSecurity: number;

  /** 必备技能 typeId 列表（JSON） */
  @Column({ type: 'text', default: '[]' })
  requiredSkills: string;

  /** 自动拒绝未达标者 */
  @Column({ default: false })
  autoReject: boolean;

  /** 是否启用门槛校验 */
  @Column({ default: true })
  enabled: boolean;
}
