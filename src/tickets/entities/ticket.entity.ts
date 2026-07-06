import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  OneToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { Project } from 'src/projects/entities/project.entity';
import { Task } from 'src/tasks/entities/task.entity';
import { ChatMessage } from 'src/chats/entities/chat-message.entity';
import { File } from 'src/files/entities/file.entity';
import { RequestCategory } from 'src/common/enums/request-category.enum';

/**
 * 🎟️ ENUMS
 */
export enum TicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum TicketStatus {
  OPEN = 'open', // ticket créé
  IN_REVIEW = 'in_review', // en cours d’analyse par admin/employé
  ACCEPTED = 'accepted', // validé → devient Task
  CONVERTED = 'converted', // associé à une Task
  CLOSED = 'closed', // clôturé
  REJECTED = 'rejected', // refusé
}

/**
 * 🎟️ ENTITY: Ticket
 * But : point d’entrée des demandes clients
 */
@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'enum',
    enum: TicketPriority,
    default: TicketPriority.MEDIUM,
  })
  priority: TicketPriority;

  @Column({
    type: 'enum',
    enum: TicketStatus,
    default: TicketStatus.OPEN,
  })
  status: TicketStatus;

  @Column({ type: 'text', nullable: true })
  rejectionReason?: string;

  // 🔹 Client Portal Fields (Phase 1)
  @Column({
    type: 'enum',
    enum: RequestCategory,
    default: RequestCategory.ANOMALY,
  })
  category?: RequestCategory; // Type de demande: anomaly, modification, evolution

  // -------------------------------
  // 🔗 RELATIONS
  // -------------------------------

  /** Client à l’origine du ticket */
  @ManyToOne(() => ClientProfile, (client) => client.tickets, {
    onDelete: 'CASCADE',
    eager: true,
  })
  client: ClientProfile;

  /** Projet associé (optionnel) */
  @ManyToOne(() => Project, (project) => project.tickets, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  project?: Project;

  /** Fichiers joints au ticket */
  @OneToMany(() => File, (file) => file.ticket, { cascade: true })
  files?: File[];

  /** Discussion privée liée au ticket */
  @OneToMany(() => ChatMessage, (message) => message.ticket, {
    cascade: true,
  })
  messages?: ChatMessage[];


  /** Tâche créée quand le ticket est accepté */
  @OneToOne(() => Task, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  task?: Task;
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
