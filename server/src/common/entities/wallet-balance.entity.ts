import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** 钱包余额快照（角色钱包 / 军团 1~7 分部钱包） */
@Entity('wallet_balances')
@Index(['ownerType', 'ownerId'])
export class WalletBalance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  ownerType: 'character' | 'corporation';

  @Column({ type: 'integer' })
  ownerId: number;

  @Column({ type: 'int', default: 1 })
  division: number;

  @Column({ type: 'real' })
  balance: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
