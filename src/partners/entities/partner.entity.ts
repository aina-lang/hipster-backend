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

/**
 * 🤝 PARTNER (fiche agence partenaire)
 * Créée uniquement par Hipster Marketing (admin).
 */
@Entity('partners')
export class Partner {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  agencyName: string;

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
