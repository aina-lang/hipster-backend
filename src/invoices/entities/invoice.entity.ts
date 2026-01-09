import { Payment } from 'src/payments/entities/payment.entity';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { Project } from 'src/projects/entities/project.entity';
import { InvoiceItem } from './invoice-item.entity';
import {
  Column,
  Entity,
  ManyToOne,
  OneToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum InvoiceType {
  QUOTE = 'quote',
  INVOICE = 'invoice',
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

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subTotal: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  taxRate: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'timestamp', nullable: true })
  dueDate: Date;

  @Column({
    type: 'enum',
    enum: InvoiceStatus,
    default: InvoiceStatus.PENDING,
  })
  status: InvoiceStatus;

  @Column({ nullable: true })
  pdfUrl?: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  issueDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  paymentDate?: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'text', nullable: true })
  terms?: string;

  // Snapshots for legal integrity
  @Column({ type: 'json', nullable: true })
  clientSnapshot?: any;

  @Column({ type: 'json', nullable: true })
  projectSnapshot?: any;

  @Column({ type: 'json', nullable: true })
  senderDetails?: any;

  // Loyalty discount tracking
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  loyaltyDiscountPercent: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  loyaltyDiscountAmount: number;

  @Column({ default: false })
  usedLoyaltyDiscount: boolean;

  @Column({ type: 'timestamp', nullable: true })
  sentAt?: Date;

  @Column({ default: false })
  tva: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  discount: number;

  @Column({ nullable: true })
  paymentMethod?: string;

  // Conversion tracking
  @Column({ nullable: true })
  convertedToInvoiceId?: number; // For quotes: ID of the invoice it was converted to

  @Column({ nullable: true })
  convertedFromQuoteId?: number; // For invoices: ID of the quote it was created from

  // Relations
  @ManyToOne(() => ClientProfile, (c) => c.invoices, { onDelete: 'CASCADE' })
  client: ClientProfile;

  @ManyToOne(() => Project, (p) => p.invoices, { onDelete: 'CASCADE' })
  project: Project;

  @OneToOne(() => Payment, (p) => p.invoice)
  payment?: Payment;

  @OneToMany(() => InvoiceItem, (item) => item.invoice, { cascade: true })
  items: InvoiceItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
