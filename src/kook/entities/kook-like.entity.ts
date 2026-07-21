import { Entity, ManyToOne, PrimaryGeneratedColumn, CreateDateColumn, Unique } from 'typeorm';
import { KookUser } from './kook-user.entity';
import { Recipe } from './recipe.entity';

@Entity('kook_likes')
@Unique(['user', 'recipe'])
export class KookLike {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => KookUser, (user) => user.id, { onDelete: 'CASCADE' })
  user: KookUser;

  @ManyToOne(() => Recipe, (recipe) => recipe.id, { onDelete: 'CASCADE' })
  recipe: Recipe;

  @CreateDateColumn()
  createdAt: Date;
}
