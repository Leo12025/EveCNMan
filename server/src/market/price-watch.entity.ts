import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** 多区域价格监控记录（按 typeId×region 记录最新价） */
@Entity('price_watches')
export class PriceWatch {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  typeId: number;

  @Column({ nullable: true })
  typeName: string;

  @Column({ type: 'integer' })
  regionId: number;

  @Column({ nullable: true })
  regionName: string;

  @Column({ type: 'real' })
  buy: number;

  @Column({ type: 'real' })
  sell: number;

  @Column({ type: 'bigint', default: 0 })
  volume: number;

  /** 断货标记 */
  @Column({ default: false })
  outOfStock: boolean;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
