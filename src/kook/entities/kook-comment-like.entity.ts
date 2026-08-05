import { Entity, ManyToOne, PrimaryGeneratedColumn, CreateDateColumn, Unique } from 'typeorm';
import { KookUser } from './kook-user.entity';
import { KookComment } from './kook-comment.entity';

@Entity('kook_comment_likes')
@Unique(['user', 'comment'])
export class KookCommentLike {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => KookUser, (user) => user.id, { onDelete: 'CASCADE' })
  user: KookUser;

  @ManyToOne(() => KookComment, (comment) => comment.id, { onDelete: 'CASCADE' })
  comment: KookComment;

  @CreateDateColumn()
  createdAt: Date;
}
