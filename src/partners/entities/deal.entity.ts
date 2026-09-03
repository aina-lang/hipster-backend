import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Partner } from './partner.entity';
import { PartnerClient } from './partner-client.entity';
import { Commission } from './commission.entity';
import { DealDocument } from './deal-document.entity';
import { User } from 'src/users/entities/user.entity';

export enum DealStatus {
  NOUVELLE_AFFAIRE = 'nouvelle_affaire',
  CLIENT_CONTACTE = 'client_contacte',
  DEVIS_EN_PREPARATION = 'devis_en_preparation',
  DEVIS_ENVOYE = 'devis_envoye',
  DEVIS_ACCEPTE = 'devis_accepte',
  ACOMPTE_ENCAISSE = 'acompte_encaisse',
  PROJET_EN_COURS = 'projet_en_cours',
  PROJET_TERMINE = 'projet_termine',
  PROJET_ANNULE = 'projet_annule',
  // Statuts closers : le closer renseigne l'issue du rendez-vous
  RDV_SIGNE = 'rdv_signe',
  RDV_NON_SIGNE = 'rdv_non_signe',
  A_RELANCER = 'a_relancer',
  RDV_ANNULE = 'rdv_annule',
}

/** Statuts réservés au fonctionnement closer */
export const CLOSER_STATUSES: DealStatus[] = [
  DealStatus.RDV_SIGNE,
  DealStatus.RDV_NON_SIGNE,
  DealStatus.A_RELANCER,
  DealStatus.RDV_ANNULE,
];

/** Types de prestation vendus par les closers */
export enum PrestationType {
  SITE_INTERNET = 'site_internet',
  CONFIGURATEUR = 'configurateur',
  ECOMMERCE = 'ecommerce',
  LOGO = 'logo',
  CREATION_GRAPHIQUE = 'creation_graphique',
  AUTRE = 'autre',
}

/**
 * 💼 DEAL (affaire / projet)
 * apporteur / realisateur = null signifie Hipster Marketing.
 */
@Entity('deals')
export class Deal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  prestationType?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amountHT: number;

  @Column({
    type: 'enum',
    enum: DealStatus,
    default: DealStatus.NOUVELLE_AFFAIRE,
  })
  status: DealStatus;

  @ManyToOne(() => PartnerClient, (c) => c.deals, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  client: PartnerClient;

  /** Apporteur de l'affaire (null = Hipster Marketing) */
  @ManyToOne(() => Partner, { nullable: true, onDelete: 'SET NULL' })
  apporteur?: Partner | null;

  /** Réalisateur du projet (null = Hipster Marketing) */
  @ManyToOne(() => Partner, { nullable: true, onDelete: 'SET NULL' })
  realisateur?: Partner | null;

  @OneToOne(() => Commission, (c) => c.deal, { cascade: true })
  commission: Commission;

  @OneToMany(() => DealDocument, (d) => d.deal)
  documents: DealDocument[];

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  createdBy?: User | null;

  /** Date de passage au statut SIGNÉ (base des paliers mensuels closers) */
  @Column({ type: 'timestamp', nullable: true })
  signedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
