import {
  Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

export enum KookUserType {
  VIEWER = 'viewer',
  CREATOR = 'creator',
}

export enum KookPlan {
  FREE = 'free',
  PREMIUM = 'premium',
}

@Entity('kook_users')
export class KookUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  firstName?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lastName?: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  avatarUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  password?: string;

  @Column({ type: 'varchar', default: KookUserType.CREATOR })
  userType: KookUserType;

  @Column({ type: 'varchar', default: KookPlan.FREE })
  plan: KookPlan;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column({ type: 'text', nullable: true, select: false })
  refreshToken?: string;

  @Column({ type: 'timestamp', nullable: true, select: false })
  refreshTokenExpiresAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
