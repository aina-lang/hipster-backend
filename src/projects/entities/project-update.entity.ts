import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Project } from './project.entity';

export enum ProjectUpdateType {
  CREATED = 'created',
  STATUS_CHANGED = 'status_changed',
  DOCUMENT_ADDED = 'document_added',
  COMMENT_ADDED = 'comment_added',
  MESSAGE_ADDED = 'message_added',
}

/**
 * 📜 PROJECT UPDATE ENTITY
 * Enregistre l'historique des modifications d'un projet (timeline)
 */
@Index('IDX_project_updates_projectId', ['projectId'], { synchronize: false } as any)
@Index('IDX_project_updates_projectId_createdAt', ['projectId', 'createdAt'], { synchronize: false } as any)
@Entity('project_updates')
export class ProjectUpdate {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  project: Project;

  @Column()
  projectId: number;

  @Column({
    type: 'enum',
    enum: ProjectUpdateType,
    default: ProjectUpdateType.CREATED,
  })
  type: ProjectUpdateType;

  @Column({ nullable: true })
  title?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'json', nullable: true })
  metadata?: any;

  @CreateDateColumn()
  createdAt: Date;
}
