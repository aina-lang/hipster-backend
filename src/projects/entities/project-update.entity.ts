import {
  Column,
  CreateDateColumn,
  Entity,
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
