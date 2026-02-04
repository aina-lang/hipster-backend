import { AiSubscriptionProfile } from './ai-subscription-profile.entity';
import {
  Column,
  Entity,
  OneToOne,
  PrimaryGeneratedColumn,
  JoinColumn,
} from 'typeorm';

@Entity('ai_credits')
export class AiCredit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ default: 100 })
  promptsLimit: number;

  @Column({ default: 50 })
  imagesLimit: number;

  @Column({ default: 10 })
  videosLimit: number;

  @Column({ default: 20 })
  audioLimit: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;

  // Relations
  @OneToOne(() => AiSubscriptionProfile, (p) => p.aiCredit, {
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  aiProfile: AiSubscriptionProfile;
}
