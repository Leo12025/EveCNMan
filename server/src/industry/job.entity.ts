import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** 制造工作单（Job）全链路跟踪 */
export type JobStatus = 'planned' | 'in_progress' | 'done' | 'delivered' | 'cancelled';

@Entity('industry_jobs')
export class IndustryJob {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  orgId: number;

  @Column({ type: 'varchar' })
  orgType: string;

  @Column({ type: 'bigint', nullable: true })
  esiJobId: number;

  @Column({ type: 'integer' })
  blueprintTypeId: number;

  @Column({ nullable: true })
  blueprintName: string;

  @Column({ type: 'integer' })
  productTypeId: number;

  @Column({ nullable: true })
  productName: string;

  @Column({ type: 'integer', default: 1 })
  runs: number;

  @Column({ type: 'varchar', default: 'planned' })
  status: JobStatus;

  /** 材料需求与消耗记录（JSON：[{typeId,name,required,used}]） */
  @Column({ type: 'text', nullable: true })
  materials: string;

  /** 发起人角色 ID */
  @Column({ type: 'integer', nullable: true })
  creatorId: number;

  @Column({ nullable: true })
  creatorName: string;

  /** 设施结构 ID/名称 */
  @Column({ nullable: true })
  facility: string;

  /** 成本（ISK） */
  @Column({ type: 'real', default: 0 })
  cost: number;

  @Column({ type: 'datetime', nullable: true })
  startedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  finishedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
