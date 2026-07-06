import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Project } from './project.entity';
import { User } from 'src/users/entities/user.entity';

/**
 * 💬 PROJECT COMMENT ENTITY
 * Commentaires et notes sur un projet (utilisé pour historique interne)
 */
@Index('IDX_project_comments_projectId', ['projectId'], { synchronize: false } as any)
@Index('IDX_project_comments_projectId_createdAt', ['projectId', 'createdAt'], { synchronize: false } as any)
@Index('IDX_project_comments_userId', ['userId'], { synchronize: false } as any)
@Entity('project_comments')
export class ProjectComment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  project: Project;

  @Column()
  projectId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Column()
  userId: number;

  @Column({ type: 'text' })
  comment: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
