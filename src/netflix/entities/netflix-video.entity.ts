import {
  Column, CreateDateColumn, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { NetflixUser } from './netflix-user.entity';
import { NetflixAccessCode } from './netflix-access-code.entity';

export enum NetflixVideoVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
}

export enum NetflixVideoType {
  FILM = 'film',
  SERIES = 'series',
}

@Entity('netflix_videos')
export class NetflixVideo {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => NetflixUser, (user) => user.id, { onDelete: 'CASCADE' })
  creator: NetflixUser;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  thumbnailUrl?: string;

  @Column({ type: 'enum', enum: NetflixVideoType, default: NetflixVideoType.FILM })
  videoType: NetflixVideoType;

  @Column({ type: 'int', nullable: true })
  seasonNumber?: number;

  @Column({ type: 'int', nullable: true })
  episodeNumber?: number;

  @Column({ type: 'int', nullable: true })
  seriesId?: number;

  @Column({ type: 'varchar', length: 255 })
  telegramFileId: string;

  @Column({ type: 'varchar', length: 512 })
  telegramFilePath: string;

  @Column({ type: 'bigint', default: 0 })
  fileSize: number;

  @Column({ type: 'int', default: 0 })
  duration: number;

  @Column({ type: 'enum', enum: NetflixVideoVisibility, default: NetflixVideoVisibility.PUBLIC })
  visibility: NetflixVideoVisibility;

  @Column({ default: false })
  isPremium: boolean;

  @Column({ type: 'int', default: 0 })
  viewsCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => NetflixAccessCode, (code) => code.video)
  accessCodes: NetflixAccessCode[];
}
