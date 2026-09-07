import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** 外交关系：蓝/白/红名单、敌对 */
export type DiploRelation = 'blue' | 'neutral' | 'red';

@Entity('diplomacy')
export class Diplomacy {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  orgId: number;

  @Column({ type: 'varchar' })
  orgType: string;

  /** 对方组织 ID（军团/联盟） */
  @Column({ type: 'integer' })
  targetId: number;

  @Column({ nullable: true })
  targetName: string;

  @Column({ type: 'varchar', default: 'neutral' })
  relation: DiploRelation;

  /** 声望（数值） */
  @Column({ type: 'real', default: 0 })
  standing: number;

  @Column({ type: 'text', nullable: true })
  note: string;
}
