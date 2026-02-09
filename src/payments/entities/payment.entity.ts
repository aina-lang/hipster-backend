import { Invoice } from 'src/invoices/entities/invoice.entity';
import { Project } from 'src/projects/entities/project.entity';
import { AiUser } from 'src/ai/entities/ai-user.entity';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
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

  @ManyToOne(() => AiUser, (a) => a.payments, {
    onDelete: 'CASCADE',
  })
  aiUser?: AiUser;

  @OneToOne(() => Project, (p) => p.payment, { onDelete: 'CASCADE' })
  @JoinColumn()
  project?: Project;

  @OneToOne(() => Invoice, (i) => i.payment, { onDelete: 'CASCADE' })
  @JoinColumn()
  invoice?: Invoice;
}
