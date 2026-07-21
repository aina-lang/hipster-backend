import {
  Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { KookUser } from './kook-user.entity';
import { RecipeCategory } from './recipe-category.entity';

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

  @Column({ type: 'json', nullable: true })
  ingredients?: string[];

  @Column({ type: 'text', nullable: true })
  instructions?: string;

  @Column({ type: 'json', nullable: true })
  steps?: { text: string; imageUrl?: string }[];

  @Column({ type: 'int', default: 0 })
  cookingTime: number;

  @Column({ type: 'enum', enum: RecipeDifficulty, default: RecipeDifficulty.FACILE })
  difficulty: RecipeDifficulty;

  @Column({ type: 'varchar', length: 512, nullable: true })
  imageUrl?: string;

  @ManyToOne(() => RecipeCategory, (category) => category.id, { nullable: true })
  category?: RecipeCategory;

  @Column({ type: 'int', nullable: true })
  categoryId?: number;

  @Column({ default: 0 })
  likesCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
