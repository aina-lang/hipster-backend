import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Partner } from './partner.entity';
import { Deal } from './deal.entity';

/**
 * 👤 PARTNER CLIENT (client léger du CRM Partners)
 * Un même client peut avoir plusieurs affaires dans le temps.
 * L'apporteur reste lié au client pour toutes ses futures demandes.
 */
@Entity('partner_clients')
export class PartnerClient {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ type: 'text', nullable: true })
  address?: string;

  /** Apporteur historique du client (null = Hipster Marketing) */
  @ManyToOne(() => Partner, { nullable: true, onDelete: 'SET NULL' })
  apporteur?: Partner | null;

  @OneToMany(() => Deal, (d) => d.client)
  deals: Deal[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
