import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** 物品每日均价历史，用于价格走势曲线（按 区域×物品×日期 去重） */
@Entity('price_history')
@Index(['regionId', 'typeId', 'date'])
export class PriceHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  regionId: number;

  @Column({ type: 'integer' })
  typeId: number;

  @Column({ type: 'varchar' })
  typeName: string;

  /** YYYY-MM-DD */
  @Column({ type: 'varchar' })
  date: string;

  @Column({ type: 'double', default: 0 })
  avgPrice: number;

  @Column({ type: 'double', default: 0 })
  highest: number;

  @Column({ type: 'double', default: 0 })
  lowest: number;

  @Column({ type: 'double', default: 0 })
  volume: number;

  @Column({ type: 'bigint', default: 0 })
  generatedAt: number;
}
