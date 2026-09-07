import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../common/entities/user.entity';

/** 支出审批流：申请 -> 财务审核 -> 打款 */
export type ExpenseStatus = 'pending' | 'approved' | 'rejected' | 'paid';

@Entity('expenses')
export class Expense {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  orgId: number;

  @Column({ type: 'varchar' })
  orgType: string;

  /** 申请标题 */
  @Column()
  title: string;

  /** 金额 */
  @Column({ type: 'real' })
  amount: number;

  /** 币种（ISK 默认） */
  @Column({ type: 'varchar', default: 'ISK' })
  currency: string;

  /** 用途分类 */
  @Column({ nullable: true })
  category: string;

  /** 收款角色/账户（角色 ID 或描述） */
  @Column({ nullable: true })
  payee: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', default: 'pending' })
  status: ExpenseStatus;

  /** 申请人 */
  @ManyToOne(() => User)
  applicant: User;

  /** 审核人 */
  @ManyToOne(() => User, { nullable: true })
  reviewer: User;

  @Column({ type: 'text', nullable: true })
  reviewNote: string;

  /** 打款凭证/交易 ID */
  @Column({ nullable: true })
  payoutRef: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
