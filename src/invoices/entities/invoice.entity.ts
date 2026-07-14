import { Payment } from 'src/payments/entities/payment.entity';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { Project } from 'src/projects/entities/project.entity';
import {
  Column,
  Entity,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum InvoiceType {
  QUOTE = 'quote', // Devis
  INVOICE = 'invoice', // Facture
}

export enum InvoiceStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  PAID = 'paid',
  CANCELED = 'canceled',
}

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  reference: string;

  @Column({
    type: 'enum',
    enum: InvoiceType,
    default: InvoiceType.INVOICE,
  })
  type: InvoiceType;

  // Montant saisi librement (champ texte)
  @Column({ type: 'varchar', length: 255, nullable: true })
  amount?: string;

  @Column({
    type: 'enum',
    enum: InvoiceStatus,
    default: InvoiceStatus.PENDING,
  })
  status: InvoiceStatus;

  // Fichier uploadé (devis ou facture scanné / généré)
  @Column({ nullable: true })
  fileUrl?: string;

  @Column({ nullable: true })
  fileName?: string;

  @Column({ nullable: true })
  originalName?: string;

  @Column({ nullable: true })
  mimeType?: string;

  @Column({ type: 'int', nullable: true })
  fileSize?: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  issueDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  dueDate?: Date;

  @Column({ type: 'timestamp', nullable: true })
  paymentDate?: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @ManyToOne(() => Project, (p) => p.invoices, { onDelete: 'CASCADE' })
  project: Project;

  // Client dénormalisé (dérivé du projet) pour les requêtes rapides
  @ManyToOne(() => ClientProfile, (c) => c.invoices, { onDelete: 'CASCADE' })
  client: ClientProfile;

  @OneToOne(() => Payment, (p) => p.invoice)
  payment?: Payment;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
