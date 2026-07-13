import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Deal } from './deal.entity';
import { Partner } from './partner.entity';

export enum CommissionStatus {
  A_CALCULER = 'a_calculer',
  A_FACTURER = 'a_facturer',
  FACTUREE = 'facturee',
  A_PAYER = 'a_payer',
  PAYEE = 'payee',
}

/**
 * 💶 COMMISSION (10 % du montant HT)
 * Bénéficiaire = apporteur de l'affaire (null = Hipster Marketing).
 */
@Entity('commissions')
export class Commission {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => Deal, (d) => d.commission, { onDelete: 'CASCADE' })
  @JoinColumn()
  deal: Deal;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 10 })
  rate: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amount: number;

  /** Bénéficiaire = apporteur (null = Hipster Marketing) */
  @ManyToOne(() => Partner, { nullable: true, onDelete: 'SET NULL' })
  beneficiary?: Partner | null;

  @Column({
    type: 'enum',
    enum: CommissionStatus,
    default: CommissionStatus.A_CALCULER,
  })
  status: CommissionStatus;

  /** Date à laquelle la commission est devenue due */
  @Column({ type: 'date', nullable: true })
  dueDate?: Date | null;

  @Column({ type: 'date', nullable: true })
  paymentDate?: Date | null;

  @Column({ nullable: true })
  invoiceReference?: string;

  /** Chemin du justificatif éventuel */
  @Column({ nullable: true })
  justificatifPath?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
