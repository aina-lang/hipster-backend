import { ClientType } from 'src/common/enums/client.enum';
import { Invoice } from 'src/invoices/entities/invoice.entity';
import { Payment } from 'src/payments/entities/payment.entity';
import { Project } from 'src/projects/entities/project.entity';
import { Ticket } from 'src/tickets/entities/ticket.entity';
import { User } from 'src/users/entities/user.entity';
import { ClientWebsite } from './client-website.entity';
import {
  Column,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('client_profiles')
export class ClientProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'enum',
    enum: ClientType,
    default: ClientType.INDIVIDUAL,
  })
  clientType: ClientType;

  @Column({ nullable: true })
  companyName?: string;

  @Column({ nullable: true })
  siret?: string;

  @Column({ nullable: true })
  tvaNumber?: string;

  @Column({ nullable: true })
  website?: string;

  @Column({ nullable: true })
  contactEmail?: string;

  @Column({ nullable: true })
  billingAddress?: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ nullable: true })
  zipCode?: string;

  @Column({ nullable: true })
  country?: string;

  @Column({ default: 0 })
  loyaltyPoints: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  cashbackTotal: number;

  @Column({ default: false })
  hasUsedBronzeDiscount: boolean;

  // Relations
  @OneToOne(() => User, (u) => u.clientProfile, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @OneToMany(() => Project, (p) => p.client, { cascade: true })
  projects: Project[];

  @OneToMany(() => Invoice, (i) => i.client, { cascade: true })
  invoices: Invoice[];

  @OneToMany(() => Ticket, (t) => t.client, { cascade: true })
  tickets: Ticket[];

  @OneToMany(() => Payment, (p) => p.client, { cascade: true })
  payments: Payment[];

  @OneToMany(() => ClientWebsite, (w) => w.client, { cascade: true })
  websites: ClientWebsite[];
}
