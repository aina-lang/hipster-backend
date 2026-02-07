import { AiUsageLog } from 'src/ai/entities/ai-usage-log.entity';
import { Payment } from 'src/payments/entities/payment.entity';
import { AiSubscription } from 'src/subscriptions/entities/ai-subscription.entity';
import { AiUser } from 'src/ai/entities/ai-user.entity';
import { AiCredit } from './ai-credit.entity';
import {
  Column,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELED = 'canceled',
  PAUSED = 'paused',
  TRIAL = 'trial',
}

export enum PlanType {
  CURIEUX = 'curieux',
  ATELIER = 'atelier',
  STUDIO = 'studio',
  AGENCE = 'agence',
}

export enum AiAccessLevel {
  GUEST = 'GUEST',
  FULL = 'FULL',
}

@Entity('ai_subscription_profiles')
export class AiSubscriptionProfile {
  @PrimaryGeneratedColumn()
  id: number;

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

  @Column({
    type: 'enum',
    enum: AiAccessLevel,
    default: AiAccessLevel.GUEST,
  })
  accessLevel: AiAccessLevel;

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

  @Column({ nullable: true })
  stripeCustomerId?: string;

  @Column({ type: 'timestamp', nullable: true })
  lastRenewalDate?: Date;

  @Column({ type: 'timestamp', nullable: true })
  nextRenewalDate?: Date;

  @Column({ type: 'timestamp', nullable: true })
  subscriptionStartDate?: Date;

  @Column({ type: 'timestamp', nullable: true })
  subscriptionEndDate?: Date;

  // Relations
  @OneToOne(() => AiUser, (u) => u.aiProfile, { onDelete: 'CASCADE' })
  @JoinColumn()
  aiUser: AiUser;

  @OneToOne(() => AiCredit, (c) => c.aiProfile, { cascade: true })
  aiCredit: AiCredit;

  @OneToMany(() => AiSubscription, (s) => s.aiProfile)
  subscriptions: AiSubscription[];

  @OneToMany(() => Payment, (p) => p.aiProfile)
  payments: Payment[];

  @OneToMany(() => AiUsageLog, (l) => l.aiProfile)
  usageLogs: AiUsageLog[];
}
