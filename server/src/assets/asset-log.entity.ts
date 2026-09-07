import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** 资产变动流水：记录谁在何时取走/转移了什么资产 */
export type AssetLogAction = 'take' | 'move' | 'deposit' | 'consume' | 'return';

@Entity('asset_logs')
export class AssetLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  orgType: string; // corporation | alliance

  @Column({ type: 'integer' })
  orgId: number;

  @Column({ type: 'bigint' })
  itemId: number;

  @Column({ type: 'integer' })
  typeId: number;

  @Column({ nullable: true })
  typeName: string;

  @Column({ type: 'integer', default: 1 })
  quantity: number;

  @Column({ type: 'varchar', default: 'take' })
  action: AssetLogAction;

  /** 来源/目的地点（location_id 或名称） */
  @Column({ nullable: true })
  fromLocation: string;

  @Column({ nullable: true })
  toLocation: string;

  /** 操作者角色 ID（取走人） */
  @Column({ type: 'integer', nullable: true })
  actorCharacterId: number;

  @Column({ nullable: true })
  actorName: string;

  /** 去向说明/用途 */
  @Column({ type: 'text', nullable: true })
  note: string;

  @Column({ type: 'varchar', default: 'manual' })
  source: string; // manual | auto-diff

  @CreateDateColumn()
  createdAt: Date;
}
