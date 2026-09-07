import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 钱包日志（ESI wallet journal）。
 * 军团钱包日志中的 player_tax / player_donation 等条目是军税核算的直接来源。
 */
@Entity('wallet_journals')
@Index(['ownerType', 'ownerId'])
@Index(['ownerType', 'ownerId', 'date'])
@Index(['ownerType', 'ownerId', 'refType'])
export class WalletJournal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  ownerType: 'character' | 'corporation';

  @Column({ type: 'integer' })
  ownerId: number;

  /** 军团钱包分部（1~7），角色钱包固定为 1 */
  @Column({ type: 'int', default: 1 })
  division: number;

  /** ESI journal 条目唯一 ID */
  @Column({ type: 'integer', unique: true })
  journalId: number;

  @Column()
  date: Date;

  /** 交易类型（player_tax / bounty_prizes / market_transaction ...） */
  @Column()
  refType: string;

  @Column({ type: 'integer', nullable: true })
  characterId: number;

  @Column({ nullable: true })
  characterName: string;

  /** 正=收入，负=支出（ISK） */
  @Column({ type: 'real' })
  amount: number;

  /** 交易后余额 */
  @Column({ type: 'real' })
  balance: number;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ type: 'integer', nullable: true })
  contextId: number;

  @CreateDateColumn()
  createdAt: Date;
}
