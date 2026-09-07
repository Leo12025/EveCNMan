import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** 结构事件提醒配置与记录：燃料低、护盾易损、权限变更 */
export type StructureAlertType = 'fuel-low' | 'vulnerable' | 'reinforced-end' | 'permission-change';

@Entity('structure_alerts')
export class StructureAlert {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  structureId: number;

  @Column({ type: 'integer' })
  orgId: number;

  @Column({ type: 'varchar' })
  type: StructureAlertType;

  @Column({ type: 'varchar', nullable: true })
  title: string;

  @Column({ type: 'text' })
  message: string;

  /** 是否通过通知渠道推送 */
  @Column({ default: false })
  notified: boolean;

  /** 提醒渠道（webhook/站内信，逗号分隔） */
  @Column({ type: 'varchar', nullable: true })
  channels: string;

  @Column({ default: false })
  resolved: boolean;

  @Column({ type: 'varchar', default: 'warning' })
  severity: string; // info | warning | critical

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
