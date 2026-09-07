import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export enum OrgType {
  ALLIANCE = 'alliance',
  CORPORATION = 'corporation',
}

/** 联盟 / 军团组织。联盟与军团共用 ID 空间，通过 type 区分。 */
@Entity('organizations')
export class Organization {
  /** EVE 侧联盟/军团 ID */
  @PrimaryColumn({ type: 'integer' })
  id: number;

  @Column({ type: 'varchar' })
  type: OrgType;

  @Column()
  name: string;

  @Column({ nullable: true })
  ticker: string;

  /** 军团挂靠的联盟 ID（type=coporation 时有效），军团可独立不挂联盟 */
  @Column({ type: 'integer', nullable: true })
  allianceId: number | null;

  /** 联盟执行军团 ID（type=alliance 时有效，同步联盟公开信息后回填） */
  @Column({ type: 'integer', nullable: true })
  executorCorporationId: number | null;

  /** 联盟成立日期（YYYY-MM-DD，type=alliance 时有效） */
  @Column({ nullable: true })
  dateFounded: string | null;

  /** 是否纳入平台管理 */
  @Column({ default: false })
  isManaged: boolean;

  /** 军税税率 0~1 */
  @Column({ type: 'real', nullable: true })
  taxRate: number;

  /** EVE 公开成员数快照（来自 ESI /corporations/{id}，无需授权；联盟同步/军团公开同步时回填） */
  @Column({ type: 'integer', nullable: true })
  esiMemberCount: number;

  /** EVE 公开军团税率快照 0~1（来源同上，0.1=10%） */
  @Column({ type: 'real', nullable: true })
  esiTaxRate: number;

  /** EVE 公开信息-CEO 角色 ID（来源同上） */
  @Column({ type: 'integer', nullable: true })
  ceoId: number;

  /** EVE 公开信息-创建人角色 ID */
  @Column({ type: 'integer', nullable: true })
  creatorId: number;

  /** CEO 角色名（同步时经 universe/names 解析写回） */
  @Column({ nullable: true })
  ceoName: string;

  /** 创建人角色名（同上） */
  @Column({ nullable: true })
  creatorName: string;

  /** 军团公开描述（来源 /corporations/{id}，无则 null） */
  @Column({ type: 'text', nullable: true })
  description: string;

  /** 军团官网 URL（公开信息字段） */
  @Column({ nullable: true })
  url: string;

  @Column({ default: '' })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
