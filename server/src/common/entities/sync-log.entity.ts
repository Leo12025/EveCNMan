import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('sync_logs')
export class SyncLog {
  @PrimaryGeneratedColumn()
  id: number;

  /** character / corporation / alliance */
  @Column()
  source: string;

  @Column({ type: 'integer' })
  entityId: number;

  @Column({ default: 'success' })
  status: 'success' | 'failed' | 'partial';

  @Column({ type: 'text', nullable: true })
  message: string;

  @Column({ type: 'int', nullable: true })
  durationMs: number;

  @CreateDateColumn()
  createdAt: Date;
}
