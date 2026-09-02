import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';

export enum PartnerType {
  /** Agence partenaire classique (suivi de projet complet) */
  AGENCY = 'agency',
  /** Closer : reçoit des RDV, indique signé / non signé, commission auto */
  CLOSER = 'closer',
}

/**
 * 🤝 PARTNER (fiche agence partenaire ou closer)
 * Créée uniquement par Hipster Marketing (admin).
 */
@Entity('partners')
export class Partner {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  agencyName: string;

  @Column({ type: 'enum', enum: PartnerType, default: PartnerType.AGENCY })
  type: PartnerType;

  @Column({ nullable: true })
  contactName?: string;

  @Column()
  email: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  speciality?: string;

  @Column({ nullable: true })
  geographicZone?: string;

  @Column({ default: true })
  isActive: boolean;

  /** Accès à l'espace partenaire (compte de connexion) */
  @Column({ default: false })
  hasPortalAccess: boolean;

  /** Compte utilisateur lié (rôle partner) — créé si hasPortalAccess */
  @OneToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  user?: User | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
