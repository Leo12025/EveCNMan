import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** 分红/贡献度发放记录 */
@Entity('payouts')
export class Payout {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  orgId: number;

  @Column({ type: 'varchar' })
  orgType: string;

  /** 周期（如 2026-03） */
  @Column()
  period: string;

  /** 总池（用于分红的金额） */
  @Column({ type: 'real' })
  pool: number;

  /** 计算方式 */
  @Column({ type: 'varchar', default: 'tax-ratio' })
  basis: string; // tax-ratio | sp | activity | equal

  /** 结果明细（JSON：[{characterId, characterName, amount, weight}]） */
  @Column({ type: 'text' })
  detail: string;

  @Column({ type: 'varchar', default: 'draft' })
  status: 'draft' | 'approved' | 'paid';

  @Column({ type: 'text', nullable: true })
  note: string;
}
