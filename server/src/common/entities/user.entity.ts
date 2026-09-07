import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { EveAccount } from './eve-account.entity';

export type UserRole = 'super_admin' | 'admin' | 'member' | 'viewer';

/** 身份主体类型：platform=平台账号（密码登录，聚合名下角色）；eve=EVE SSO 角色独立会话 */
export type UserKind = 'platform' | 'eve';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  /** 身份主体类型 */
  @Column({ default: 'eve' })
  kind: UserKind;

  /** 平台账号密码哈希（scrypt「salt:hash」；EVE 角色身份无密码） */
  @Column({ type: 'text', nullable: true, select: false })
  passwordHash: string | null;

  /** 平台权限：super_admin / admin / member / viewer */
  @Column({ default: 'member' })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => EveAccount, (acc) => acc.user)
  eveAccounts: EveAccount[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
