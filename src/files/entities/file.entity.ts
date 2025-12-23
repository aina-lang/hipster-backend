import { Project } from 'src/projects/entities/project.entity';
import { Task } from 'src/tasks/entities/task.entity';
import { Ticket } from 'src/tickets/entities/ticket.entity';
import { User } from 'src/users/entities/user.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity('files')
export class File {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  url: string;

  @Column({ nullable: true })
  type?: string;

  @Column({ nullable: true })
  size?: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  uploadedAt: Date;

  // Relations
  @ManyToOne(() => Project, (p) => p.files, { onDelete: 'CASCADE' })
  project?: Project;

  @ManyToOne(() => Task, (t) => t, { onDelete: 'SET NULL' })
  task?: Task;

  @ManyToOne(() => Ticket, (t) => t, { onDelete: 'SET NULL' })
  ticket?: Ticket;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  uploadedBy: User;
}
