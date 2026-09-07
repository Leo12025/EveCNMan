import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * 数据快照：角色（技能/位置/在线/舰船/克隆/忠诚点/蓝图/工业）
 * 与 军团（结构/分部/工业）以 JSON 字符串存储，避免为每种数据建表。
 */
@Entity('character_snapshots')
export class CharacterSnapshot {
  @PrimaryColumn()
  ownerType: 'character' | 'corporation';

  @PrimaryColumn({ type: 'integer' })
  ownerId: number;

  @Column({ type: 'text' })
  payload: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
