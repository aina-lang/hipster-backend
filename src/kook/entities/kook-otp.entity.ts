import {
  Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import * as bcrypt from 'bcrypt';
import { KookUser } from './kook-user.entity';

export enum KookOtpType {
  REGISTER = 'register',
  LOGIN = 'login',
  PASSWORD_RESET = 'password_reset',
}

@Entity('kook_otps')
export class KookOtp {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => KookUser, (user) => user.id, { onDelete: 'CASCADE' })
  user: KookUser;

  @Column({ type: 'varchar', length: 255, select: false })
  hashedCode: string;

  @Column({ type: 'varchar', length: 20 })
  type: KookOtpType;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ default: false })
  consumed: boolean;

  @CreateDateColumn()
  createdAt: Date;

  async setCode(code: string): Promise<void> {
    this.hashedCode = await bcrypt.hash(code, 10);
  }

  async isValid(code: string): Promise<boolean> {
    return !this.consumed && this.expiresAt > new Date() && bcrypt.compare(code, this.hashedCode);
  }
}
