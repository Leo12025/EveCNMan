import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** 军团市场订单（本地维护，ESI 同步结构/id） */
export type OrderState = 'open' | 'closed' | 'cancelled';

@Entity('market_orders')
export class MarketOrder {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bigint', nullable: true })
  esiOrderId: number;

  @Column({ type: 'integer' })
  orgId: number;

  @Column({ type: 'varchar' })
  orgType: string;

  @Column({ type: 'integer' })
  typeId: number;

  @Column({ nullable: true })
  typeName: string;

  @Column({ type: 'integer' })
  regionId: number;

  @Column({ nullable: true })
  regionName: string;

  @Column({ type: 'integer', default: 1 })
  volumeRemain: number;

  @Column({ type: 'integer', default: 0 })
  volumeTotal: number;

  @Column({ type: 'real' })
  price: number;

  @Column({ type: 'varchar', default: 'buy' })
  side: 'buy' | 'sell';

  @Column({ type: 'varchar', default: 'open' })
  state: OrderState;

  /** 监控目标价（低于/高于则提醒） */
  @Column({ type: 'real', nullable: true })
  watchPrice: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
