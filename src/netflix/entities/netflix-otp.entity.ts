import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import * as bcrypt from 'bcrypt';
import { NetflixUser } from './netflix-user.entity';

export enum NetflixOtpType {
  REGISTER = 'register',
  LOGIN = 'login',
  PASSWORD_RESET = 'password_reset',
}

/**
 * 🔐 NETFLIX OTP (isolé). Code à usage unique envoyé par SMS/téléphone.
 * Ne dépend d'aucun autre module (pas de mail externe).
 */
@Entity('netflix_otps')
export class NetflixOtp {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => NetflixUser, (user) => user.id, { onDelete: 'CASCADE' })
  user: NetflixUser;

  @Column({ type: 'varchar', length: 255, select: false })
  hashedCode: string;

  @Column({ type: 'varchar', length: 20 })
  type: NetflixOtpType;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ default: false })
  consumed: boolean;

  @CreateDateColumn()
  createdAt: Date;

  async setCode(code: string) {
    this.hashedCode = await bcrypt.hash(code, 10);
  }

  async isValid(code: string): Promise<boolean> {
    if (this.consumed) return false;
    if (this.expiresAt < new Date()) return false;
    return bcrypt.compare(code, this.hashedCode);
  }
}
