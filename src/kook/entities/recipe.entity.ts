import {
  Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { KookUser } from './kook-user.entity';

export enum RecipeDifficulty {
  FACILE = 'facile',
  MOYEN = 'moyen',
  DIFFICILE = 'difficile',
}

@Entity('kook_recipes')
export class Recipe {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => KookUser, (user) => user.id, { onDelete: 'CASCADE' })
  creator: KookUser;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'text', nullable: true })
  ingredients?: string;

  @Column({ type: 'text', nullable: true })
  instructions?: string;

  @Column({ type: 'int', default: 0 })
  cookingTime: number;

  @Column({ type: 'enum', enum: RecipeDifficulty, default: RecipeDifficulty.FACILE })
  difficulty: RecipeDifficulty;

  @Column({ type: 'varchar', length: 512, nullable: true })
  imageUrl?: string;

  @Column({ default: 0 })
  likesCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
