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
} from 'typeorm';
import { Project } from 'src/projects/entities/project.entity';
import { EmployeeProfile } from 'src/profiles/entities/employee-profile.entity';
import { Ticket } from 'src/tickets/entities/ticket.entity';



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
  URGENT = 'urgent',
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
  @ManyToOne(() => Project, (p) => p.tasks, { onDelete: 'CASCADE' })
  project: Project;

  // ✅ Plusieurs employés peuvent être assignés à la même tâche
  @ManyToMany(() => EmployeeProfile, (e) => e.tasks, { cascade: true })
  @JoinTable({
    name: 'task_assignees',
    joinColumn: { name: 'task_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'employee_id', referencedColumnName: 'id' },
  })
  assignees: EmployeeProfile[];

  // 🔗 Si cette tâche vient d’un ticket
  @OneToOne(() => Ticket, (t) => t.task, { nullable: true })
  ticket?: Ticket;
}
