import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** 军税记录：按 组织×角色×年月 聚合 */
@Entity('tax_records')
@Index(['orgId', 'year', 'month'])
export class TaxRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  orgId: number;

  @Column()
  orgName: string;

  @Column({ type: 'integer' })
  characterId: number;

  @Column()
  characterName: string;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'int' })
  month: number;

  /** 当月缴纳军税（ISK） */
  @Column({ type: 'real' })
  amount: number;

  @Column({ type: 'text', nullable: true })
  note: string;

  @CreateDateColumn()
  createdAt: Date;
}
