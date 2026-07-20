import {
  Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { NetflixVideo } from './netflix-video.entity';

@Entity('netflix_access_codes')
export class NetflixAccessCode {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => NetflixVideo, (video) => video.accessCodes, { onDelete: 'CASCADE' })
  video: NetflixVideo;

  @Column({ type: 'varchar', length: 64, unique: true })
  code: string;

  @Column({ default: false })
  isUsed: boolean;

  @Column({ type: 'timestamp', nullable: true })
  usedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt?: Date;

  @CreateDateColumn()
  createdAt: Date;
}
