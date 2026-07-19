import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum NetflixUserType {
  VIEWER = 'viewer',
  CREATOR = 'creator',
}

export enum NetflixPlan {
  FREE = 'free',
  PREMIUM = 'premium',
}

/**
 * 🎬 NETFLIX USER (isolé de tous les autres modules)
 * Entité dédiée à l'app Netflix Gasy. Authentification par numéro de téléphone.
 */
@Entity('netflix_users')
export class NetflixUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  firstName?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lastName?: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  avatarUrl?: string;

  @Column({ type: 'varchar', length: 255, select: false })
  password?: string;

  @Column({
    type: 'varchar',
    default: NetflixUserType.VIEWER,
  })
  userType: NetflixUserType;

  @Column({
    type: 'varchar',
    default: NetflixPlan.FREE,
  })
  plan: NetflixPlan;

  @Column({ default: false })
  isPhoneVerified: boolean;

  @Column({ type: 'text', nullable: true, select: false })
  refreshToken?: string | null;

  @Column({ type: 'timestamp', nullable: true, select: false })
  refreshTokenExpiresAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
