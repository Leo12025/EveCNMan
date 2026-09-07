import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** SRP 报销规则：按船型/联盟条约配置报销比例与上限 */
@Entity('srp_rules')
export class SrpRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  orgId: number;

  @Column({ type: 'varchar' })
  orgType: string;

  /** 适用船型（typeId）或 'all'；支持 hull_group 关键字 */
  @Column({ type: 'varchar' })
  shipType: string;

  /** 报销比例 0-1 */
  @Column({ type: 'real', default: 1 })
  ratio: number;

  /** 单笔上限 ISK（0=不限） */
  @Column({ type: 'real', default: 0 })
  cap: number;

  /** 是否需要击杀发生在盟友/合同行动中（treaty） */
  @Column({ default: false })
  treatyOnly: boolean;

  @Column({ default: true })
  enabled: boolean;
}
