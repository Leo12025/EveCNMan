import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** 军团建筑（Upwell 结构 + 前哨 + POCO 等），来自 esi-corporations.read_structures.v1 */
@Entity('structures')
@Index(['corporationId'])
@Index(['typeId'])
@Index(['systemId'])
export class Structure {
  /** 建筑实例 ID（ESI structure_id，唯一） */
  @PrimaryColumn({ type: 'bigint' })
  id: string;

  /** 所属军团 ID */
  @Column({ type: 'integer' })
  corporationId: number;

  /** 建筑类型 type_id（星城/精炼厂/钻井平台等） */
  @Column({ type: 'integer' })
  typeId: number;

  /** 建筑类型名称（resolveNames 解析） */
  @Column({ nullable: true })
  typeName: string;

  /** 所在星系 ID */
  @Column({ type: 'integer', nullable: true })
  systemId: number;

  /** 星系名称 */
  @Column({ nullable: true })
  systemName: string;

  /** 所在星座 ID */
  @Column({ type: 'integer', nullable: true })
  constellationId: number;

  /** 所在星域 ID */
  @Column({ type: 'integer', nullable: true })
  regionId: number;

  /** 所在星域名称 */
  @Column({ nullable: true })
  regionName: string;

  /** 配置文件 ID（钻井平台等） */
  @Column({ type: 'integer', nullable: true })
  profileId: number;

  /** 状态：shield_vulnerable / armor_vulnerable / hull_vulnerable / online / anchoring / unanchoring / anchor_vulnerable 等 */
  @Column({ nullable: true })
  state: string;

  /** 燃料剩余（钻井平台等，小时） */
  @Column({ type: 'integer', nullable: true })
  fuelExpiresHours: number;

  /** 下一次 vulnerable 窗口（ISO） */
  @Column({ type: 'varchar', nullable: true })
  nextVulnerableStart: string | null;

  /** 下一次 vulnerable 窗口结束（ISO） */
  @Column({ type: 'varchar', nullable: true })
  nextVulnerableEnd: string | null;

  /** 服务模块列表（JSON 字符串） */
  @Column({ type: 'text', nullable: true })
  services: string;

  /** 当前权限 ACL 摘要（角色→权限 的哈希，用于检测权限变更） */
  @Column({ type: 'varchar', nullable: true })
  aclHash: string | null;

  /** 是否为要塞/指挥要塞（幅度加成） */
  @Column({ default: false })
  isCitadel: boolean;

  /** 备注（管理员填写） */
  @Column({ type: 'text', nullable: true })
  note: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
