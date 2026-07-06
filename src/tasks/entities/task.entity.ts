import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  ManyToMany,
  JoinTable,
  OneToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Project } from 'src/projects/entities/project.entity';
import { EmployeeProfile } from 'src/profiles/entities/employee-profile.entity';
import { Ticket } from 'src/tickets/entities/ticket.entity';
import { User } from 'src/users/entities/user.entity';
import { ClientWebsite } from '../../profiles/entities/client-website.entity';

export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  REVIEW = 'review',
  DONE = 'done',
  BLOCKED = 'blocked',
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.TODO,
  })
  status: TaskStatus;

  @Column({
    type: 'enum',
    enum: TaskPriority,
    default: TaskPriority.MEDIUM,
  })
  priority: TaskPriority;

  @Column({ type: 'timestamp', nullable: true })
  dueDate?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // 🔗 Relations
  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  project: Project;

  // ✅ Plusieurs employés peuvent être assignés à la même tâche
  @ManyToMany(() => EmployeeProfile, { cascade: true })
  @JoinTable({
    name: 'task_assignees',
    joinColumn: { name: 'task_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'employee_id', referencedColumnName: 'id' },
  })
  assignees: EmployeeProfile[];

  // 🔗 Si cette tâche vient d'un ticket
  @ManyToOne(() => Ticket, { nullable: true, onDelete: 'SET NULL' })
  ticket?: Ticket;

  // 🔗 Si cette tâche représente un site web (pour maintenance)
  @ManyToOne(() => ClientWebsite, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'websiteId' })
  website?: ClientWebsite;

  @Column({ nullable: true })
  websiteId?: number;

  // 🔹 Audit Fields
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  createdBy: User;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  updatedBy: User;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  movedBy: User;

  @Column({ type: 'timestamp', nullable: true })
  movedAt: Date;

  // 🔄 Recurrence
  @Column({ nullable: true })
  recurrenceType?: string; // 'daily', 'weekly', 'monthly', 'custom'

  @Column({ type: 'simple-array', nullable: true })
  recurrenceDays?: string[]; // e.g., ['monday', 'thursday']

  @Column({ nullable: true })
  recurrenceInterval?: number; // e.g., every N days for 'interval' type

  @Column({ nullable: true })
  nextRunAt?: Date;
}
