import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { Task } from 'src/tasks/entities/task.entity';
import { Ticket } from 'src/tickets/entities/ticket.entity';
import { File } from 'src/files/entities/file.entity';
import { Payment } from 'src/payments/entities/payment.entity';
import { ProjectMember } from './project-member.entity';
import { Invoice } from 'src/invoices/entities/invoice.entity';
import { User } from 'src/users/entities/user.entity';
import { ClientWebsite } from '../../profiles/entities/client-website.entity';
import { JoinTable, ManyToMany } from 'typeorm';
import type { MaintenanceConfig } from '../interfaces/maintenance-config.interface';

export enum ProjectStatus {
  PLANNED = 'planned',
  IN_PROGRESS = 'in_progress',
  ON_HOLD = 'on_hold',
  COMPLETED = 'completed',
  CANCELED = 'canceled',
}

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'timestamp' })
  start_date: Date;

  @Column({ type: 'timestamp', nullable: true })
  end_date?: Date;

  @Column({
    type: 'enum',
    enum: ProjectStatus,
    default: ProjectStatus.PLANNED,
  })
  status: ProjectStatus;

  @Column({ type: 'timestamp', nullable: true })
  real_end_date?: Date;

  @Column({ type: 'boolean', default: false })
  is_manual_status: boolean;

  // 🔹 Calculated property (not in DB)
  progress: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  budget: number;

  @Column({ type: 'json', nullable: true })
  maintenanceConfig?: MaintenanceConfig;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => ClientProfile, (c) => c.projects, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  client: ClientProfile;

  @OneToMany(() => Task, (t) => t.project)
  tasks: Task[];

  @OneToMany(() => File, (f) => f.project)
  files: File[];

  @OneToMany(() => Ticket, (t) => t.project)
  tickets: Ticket[];

  @OneToMany(() => ProjectMember, (pm) => pm.project)
  members: ProjectMember[];

  @OneToOne(() => Payment, (p) => p.project)
  payment?: Payment;

  @OneToMany(() => Invoice, (i) => i.project)
  invoices: Invoice[];

  // 🔹 Audit Fields
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  createdBy: User;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  updatedBy: User;

  @ManyToMany(() => ClientWebsite)
  @JoinTable()
  websites: ClientWebsite[];

  // 🔄 Recurrence (Global for Maintenance Project)
  @Column({ nullable: true })
  recurrenceType?: string; // 'daily', 'weekly', 'monthly', 'custom'

  @Column({ nullable: true })
  recurrenceInterval?: number; // e.g., every 2 days

  @Column({ type: 'simple-array', nullable: true })
  recurrenceDays?: string[]; // e.g., ['monday', 'thursday']
}
