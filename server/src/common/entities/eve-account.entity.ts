import {
  AfterLoad,
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { CryptoService } from '../crypto.service';

let cryptoRef: CryptoService | null = null;

/** 由 CommonModule 注入，供实体钩子透明加解密 token */
export function setEveAccountCrypto(svc: CryptoService | null) {
  cryptoRef = svc;
}

@Entity('eve_accounts')
export class EveAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (u) => u.eveAccounts, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  /**
   * 归属的平台账号（聚合「名下角色」用）。
   * 与 `user` 解耦：`user` 恒为该角色的独立身份（eve:<角色ID>），即使角色被绑定到平台账号，
   * 该角色用 EVE SSO 直接登录时仍以自身身份为会话、只拥有自身权限；平台账号登录时按本列取并集。
   */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'platformUserId' })
  platformUser: User | null;

  /** EVE 角色 ID */
  @Column({ unique: true })
  characterId: number;

  @Column()
  characterName: string;

  @Column({ nullable: true })
  corporationId: number;

  @Column({ nullable: true })
  corporationName: string;

  @Column({ nullable: true })
  allianceId: number;

  @Column({ nullable: true })
  allianceName: string;

  @Column({ nullable: true })
  avatarUrl: string;

  /** 授权 scope（逗号分隔） */
  @Column({ type: 'text', nullable: true })
  scopes: string;

  @Column({ type: 'text', nullable: true })
  accessToken: string;

  @Column({ type: 'text', nullable: true })
  refreshToken: string;

  /** token 是否以加密形式落库（旧数据升级后落库为 true） */
  @Column({ default: false })
  tokenEncrypted: boolean;

  @Column({ nullable: true })
  tokenExpiresAt: Date;

  @Column({ nullable: true })
  lastSyncedAt: Date;

  /** 是否为账号主角色（首次绑定） */
  @Column({ default: false })
  isMain: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @BeforeInsert()
  @BeforeUpdate()
  encryptTokens() {
    if (!cryptoRef) return;
    if (this.accessToken && !(this as any).__accessEncrypted) {
      this.accessToken = cryptoRef.encrypt(this.accessToken);
      (this as any).__accessEncrypted = true;
    }
    if (this.refreshToken && !(this as any).__refreshEncrypted) {
      this.refreshToken = cryptoRef.encrypt(this.refreshToken);
      (this as any).__refreshEncrypted = true;
    }
    if (this.accessToken || this.refreshToken) this.tokenEncrypted = true;
  }

  @AfterLoad()
  decryptTokens() {
    if (!cryptoRef || !this.tokenEncrypted) return;
    if (this.accessToken) this.accessToken = cryptoRef.decrypt(this.accessToken);
    if (this.refreshToken) this.refreshToken = cryptoRef.decrypt(this.refreshToken);
  }
}
