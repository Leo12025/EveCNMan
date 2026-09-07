import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** 材料库存与缺口预警：维护某组织关注的材料 typeId 的目标库存与告警阈值 */
@Entity('material_needs')
export class MaterialNeed {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  orgId: number;

  @Column({ type: 'varchar' })
  orgType: string;

  @Column({ type: 'integer' })
  typeId: number;

  @Column({ nullable: true })
  typeName: string;

  /** 目标库存量 */
  @Column({ type: 'bigint', default: 0 })
  target: number;

  /** 低于该量触发缺口预警 */
  @Column({ type: 'bigint', default: 0 })
  threshold: number;

  @Column({ type: 'varchar', default: 'manual' })
  source: string; // manual | blueprint-required
}
