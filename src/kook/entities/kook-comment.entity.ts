import {
  Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { KookUser } from './kook-user.entity';
import { Recipe } from './recipe.entity';

@Entity('kook_comments')
export class KookComment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => KookUser, (user) => user.id, { onDelete: 'CASCADE' })
  author: KookUser;

  @ManyToOne(() => Recipe, (recipe) => recipe.id, { onDelete: 'CASCADE' })
  recipe: Recipe;

  @Column({ type: 'text' })
  text: string;

  @ManyToOne(() => KookComment, (comment) => comment.id, { onDelete: 'CASCADE', nullable: true })
  parent?: KookComment;

  @Column({ default: 0 })
  likesCount: number;

  @CreateDateColumn()
  createdAt: Date;
}
