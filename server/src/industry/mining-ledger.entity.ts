import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** 矿队产量统计（Mining Ledger）聚合：按角色×矿石×月 */
@Entity('mining_ledgers')
export class MiningLedger {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  orgId: number;

  @Column({ type: 'integer' })
  characterId: number;

  @Column({ nullable: true })
  characterName: string;

  /** 周期 2026-03 */
  @Column()
  period: string;

  @Column({ type: 'integer' })
  typeId: number;

  @Column({ nullable: true })
  typeName: string;

  @Column({ type: 'bigint', default: 0 })
  quantity: number;

  /** 估算价值（ISK） */
  @Column({ type: 'real', default: 0 })
  value: number;
}
