import {
  Column,
  CreateDateColumn,
  Entity,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AiSubscriptionProfile } from 'src/profiles/entities/ai-subscription-profile.entity';

@Entity('ai_users')
export class AiUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

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

  @OneToOne(() => AiSubscriptionProfile, (p) => p.aiUser, {
    cascade: true,
    nullable: true,
  })
  aiProfile?: AiSubscriptionProfile;
}
