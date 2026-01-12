import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AiSubscriptionProfile } from 'src/profiles/entities/ai-subscription-profile.entity';
import { Otp } from 'src/otp/enitities/otp.entity';

@Entity('ai_users')
export class AiUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firstName: string;

  @Column({ nullable: true })
  lastName: string;

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

  @OneToOne(() => AiSubscriptionProfile, (p) => p.aiUser, {
    cascade: true,
    nullable: true,
  })
  aiProfile?: AiSubscriptionProfile;

  @OneToMany(() => Otp, (otp) => otp.aiUser)
  otps: Otp[];
}
