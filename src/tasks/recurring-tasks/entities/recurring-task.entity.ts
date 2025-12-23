import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Project } from 'src/projects/entities/project.entity';
import { User } from 'src/users/entities/user.entity';
import { TaskPriority, TaskStatus } from 'src/tasks/entities/task.entity';

@Entity('recurring_tasks')
export class RecurringTask {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  cronExpression: string; // e.g. "0 9 * * 1"

  @Column({ type: 'timestamp' })
  nextRunAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastRunAt?: Date;

  @Column({ default: true })
  isActive: boolean;

  // Task Template Fields
  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: TaskPriority,
    default: TaskPriority.MEDIUM,
  })
  priority: TaskPriority;

  @Column({ nullable: true })
  assigneeId?: number;

  // Relations
  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  project: Project;

  @ManyToOne(() => User, { nullable: true })
  createdBy: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
