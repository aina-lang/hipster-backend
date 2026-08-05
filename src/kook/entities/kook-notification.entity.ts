import {
  Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { KookUser } from './kook-user.entity';

export enum NotificationType {
  LIKE = 'like',
  COMMENT = 'comment',
  REPLY = 'reply',
  FOLLOW = 'follow',
}

@Entity('kook_notifications')
export class KookNotification {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => KookUser, (user) => user.id, { onDelete: 'CASCADE' })
  recipient: KookUser;

  @ManyToOne(() => KookUser, (user) => user.id, { onDelete: 'CASCADE', nullable: true })
  actor?: KookUser;

  @Column({ type: 'varchar', length: 50 })
  type: NotificationType;

  @Column({ type: 'text', nullable: true })
  message?: string;

  @Column({ type: 'int', nullable: true })
  recipeId?: number;

  @Column({ type: 'int', nullable: true })
  commentId?: number;

  @Column({ default: false })
  isRead: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
