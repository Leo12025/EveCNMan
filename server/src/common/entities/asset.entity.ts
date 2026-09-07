import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** 资产条目（角色/军团资产）。按扁平结构存储，父级位置通过 locationId 关联。 */
@Entity('assets')
@Index(['ownerType', 'ownerId'])
@Index(['ownerType', 'ownerId', 'typeId'])
export class Asset {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  ownerType: 'character' | 'corporation';

  @Column({ type: 'integer' })
  ownerId: number;

  /** ESI 物品实例 item_id（唯一） */
  @Column({ type: 'integer' })
  itemId: number;

  /** EVE 物品 type_id */
  @Column({ type: 'integer' })
  typeId: number;

  @Column()
  typeName: string;

  /** 所在容器/空间站/结构的 location_id */
  @Column({ type: 'integer', nullable: true })
  locationId: number;

  @Column({ nullable: true })
  locationName: string;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ default: false })
  isBlueprint: boolean;

  /** 是否为唯一实例（舰船/已装配装备等） */
  @Column({ default: false })
  isSingleton: boolean;

  /** 估算价值（ISK） */
  @Column({ type: 'real', default: 0 })
  estimatedValue: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
