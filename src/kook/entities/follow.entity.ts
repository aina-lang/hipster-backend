import { Entity, ManyToOne, PrimaryGeneratedColumn, CreateDateColumn, Unique } from 'typeorm';
import { KookUser } from './kook-user.entity';

@Entity('kook_follows')
@Unique(['follower', 'following'])
export class Follow {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => KookUser, (user) => user.id, { onDelete: 'CASCADE' })
  follower: KookUser;

  @ManyToOne(() => KookUser, (user) => user.id, { onDelete: 'CASCADE' })
  following: KookUser;

  @CreateDateColumn()
  createdAt: Date;
}
