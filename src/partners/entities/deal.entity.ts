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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
