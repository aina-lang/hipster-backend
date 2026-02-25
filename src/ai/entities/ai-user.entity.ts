import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Otp } from 'src/otp/enitities/otp.entity';
import { Payment } from 'src/payments/entities/payment.entity';
import { AiUsageLog } from './ai-usage-log.entity';

export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELED = 'canceled',
  PAUSED = 'paused',
  TRIAL = 'trial',
  PAST_DUE = 'past_due',
}

export enum PlanType {
  CURIEUX = 'curieux',
  ATELIER = 'atelier',
  STUDIO = 'studio',
  AGENCE = 'agence',
}

@Entity('ai_users')
export class AiUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  avatarUrl?: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column({ nullable: true, type: 'text' })
  refreshToken?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Subscription & Credits (Merged from AiSubscriptionProfile)
  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.TRIAL,
  })
  subscriptionStatus: SubscriptionStatus;

  @Column({
    type: 'enum',
    enum: PlanType,
    default: PlanType.CURIEUX,
  })
  planType: PlanType;

  @Column({ default: false })
  hasUsedTrial: boolean;

  @Column({ default: 100 })
  promptsLimit: number;

  @Column({ default: 50 })
  imagesLimit: number;

  @Column({ default: 10 })
  videosLimit: number;

  @Column({ default: 20 })
  audioLimit: number;

  @Column({ default: 0 })
  threeDLimit: number;

  @Column({ type: 'timestamp', nullable: true })
  subscriptionStartDate?: Date;

  @Column({ type: 'timestamp', nullable: true })
  subscriptionEndDate?: Date;

  @Column({ nullable: true })
  stripeCustomerId?: string;

  @Column({ nullable: true })
  stripeSubscriptionId?: string;

  // Branding & Professional (Merged from AiSubscriptionProfile)
  @Column({ nullable: true })
  isSetupComplete: boolean;

  @Column({ nullable: true })
  job?: string;

  @Column({ nullable: true })
  brandingColor?: string;

  @Column({ nullable: true })
  professionalEmail?: string;

  @Column({ nullable: true })
  professionalAddress?: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ nullable: true })
  postalCode?: string;

  @Column({ nullable: true })
  country?: string;

  @Column({ nullable: true })
  professionalPhone?: string;

  @Column({ nullable: true })
  professionalPhone2?: string;

  @Column({ nullable: true })
  siret?: string;

  @Column({ nullable: true })
  vatNumber?: string;

  @Column({ nullable: true })
  bankDetails?: string;

  @Column({ nullable: true })
  websiteUrl?: string;

  @Column({ nullable: true })
  logoUrl?: string;

  // Relations
  @OneToMany(() => Otp, (otp) => otp.aiUser)
  otps: Otp[];

  @OneToMany(() => Payment, (p) => p.aiUser)
  payments: Payment[];

  @OneToMany(() => AiUsageLog, (l) => l.user)
  usageLogs: AiUsageLog[];
}
