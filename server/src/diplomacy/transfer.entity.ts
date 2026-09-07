import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** 联盟间转会流程（Transfer） */
export type TransferStatus = 'requested' | 'approved' | 'rejected' | 'done';

@Entity('transfers')
export class Transfer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  characterId: number;

  @Column({ nullable: true })
  characterName: string;

  /** 来源/目标组织 */
  @Column({ type: 'integer' })
  fromOrgId: number;

  @Column({ type: 'integer' })
  toOrgId: number;

  @Column({ nullable: true })
  toOrgName: string;

  @Column({ type: 'varchar', default: 'requested' })
  status: TransferStatus;

  @Column({ type: 'text', nullable: true })
  note: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
