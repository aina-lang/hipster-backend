import { AiSubscriptionProfile } from 'src/profiles/entities/ai-subscription-profile.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity('ai_usage_logs')
export class AiUsageLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  prompt: string;

  @Column()
  tokensUsed: number;

  @Column({ type: 'decimal', precision: 10, scale: 6 })
  cost: number;

  @Column({ type: 'timestamp' })
  dateUsed: Date;

  // Relation
  @ManyToOne(() => AiSubscriptionProfile, (p) => p.usageLogs)
  aiProfile: AiSubscriptionProfile;
}
