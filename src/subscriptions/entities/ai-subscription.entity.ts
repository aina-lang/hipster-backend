import { Payment } from 'src/payments/entities/payment.entity';
import { AiSubscriptionProfile } from 'src/profiles/entities/ai-subscription-profile.entity';
import {
  Column,
  Entity,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('ai_subscriptions')
export class AiSubscription {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  planName: string;

  @Column({ type: 'timestamp' })
  startDate: Date;

  @Column({ type: 'timestamp', nullable: true })
  endDate?: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({
    type: 'enum',
    enum: ['active', 'canceled', 'expired'],
    default: 'active',
  })
  status: string;

  @Column({ nullable: true })
  paymentMethod?: string;

  // Relations
  @ManyToOne(() => AiSubscriptionProfile, (p) => p.subscriptions)
  aiProfile: AiSubscriptionProfile;

  @OneToOne(() => Payment, (p) => p.aiSubscription)
  payment?: Payment;
}
