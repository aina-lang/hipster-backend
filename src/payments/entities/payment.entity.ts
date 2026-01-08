import { Invoice } from 'src/invoices/entities/invoice.entity';
import { AiSubscriptionProfile } from 'src/profiles/entities/ai-subscription-profile.entity';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { Project } from 'src/projects/entities/project.entity';
import { AiSubscription } from 'src/subscriptions/entities/ai-subscription.entity';
import { User } from 'src/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum PaymentType {
  PROJECT = 'project',
  SUBSCRIPTION = 'subscription',
}

export enum PaymentProvider {
  STRIPE = 'stripe',
  PAYPAL = 'paypal',
}

export enum PaymentStatus {
  PENDING = 'pending',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ default: 'EUR' })
  currency: string;

  @Column({
    type: 'enum',
    enum: PaymentType,
  })
  paymentType: PaymentType;

  @Column({
    type: 'enum',
    enum: PaymentProvider,
  })
  provider: PaymentProvider;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column()
  reference: string;

  @CreateDateColumn()
  createdAt: Date;

  // Relations
  // Relations
  @ManyToOne(() => User, (u) => u.payments, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => ClientProfile, (c) => c.payments, { onDelete: 'CASCADE' })
  client?: ClientProfile;

  @ManyToOne(() => AiSubscriptionProfile, (a) => a.payments, {
    onDelete: 'CASCADE',
  })
  aiProfile?: AiSubscriptionProfile;

  @OneToOne(() => Project, (p) => p.payment, { onDelete: 'CASCADE' })
  @JoinColumn()
  project?: Project;

  @OneToOne(() => Invoice, (i) => i.payment)
  invoice?: Invoice;

  @OneToOne(() => AiSubscription, (s) => s.payment)
  @JoinColumn()
  aiSubscription?: AiSubscription;
}
