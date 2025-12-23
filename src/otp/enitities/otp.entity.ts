import { OtpType } from 'src/common/enums/otp.enum';
import { User } from 'src/users/entities/user.entity';
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
    nullable: false,
    onDelete: 'CASCADE', // ✅ Si user supprimé → OTP supprimés
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  token: string; // 🔐 valeur hachée de l’OTP

  @Column({ type: 'enum', enum: OtpType })
  type: OtpType;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
