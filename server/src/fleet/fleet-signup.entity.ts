import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** 舰队登记（编成）：角色×舰队×职责 */
@Entity('fleet_signups')
export class FleetSignup {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  fleetId: number;

  @Column({ type: 'integer' })
  characterId: number;

  @Column({ nullable: true })
  characterName: string;

  /** 编成角色（FC/Logi/DPS/Scout 等） */
  @Column({ nullable: true })
  role: string;

  /** 是否实际到场（参与度统计） */
  @Column({ default: false })
  attended: boolean;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  signedAt: Date;
}
