import { OtpType } from 'src/common/enums/otp.enum';
import { User } from 'src/users/entities/user.entity';
import { AiUser } from 'src/ai/entities/ai-user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * 📩 OTP Entity
 * But : gérer les OTP pour vérification, mot de passe oublié, double authentification
 */
@Entity('otps')
export class Otp {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.otps, {
    nullable: true,
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @ManyToOne(() => AiUser, (aiUser) => aiUser.otps, {
    nullable: true,
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'aiUserId' })
  aiUser?: AiUser;

  @Column()
  token: string; // 🔐 valeur hachée de l’OTP

  @Column({ type: 'enum', enum: OtpType })
  type: OtpType;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
