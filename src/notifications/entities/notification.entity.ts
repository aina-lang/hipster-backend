import { User } from 'src/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  type?: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'json', nullable: true })
  data?: any;

  // 🔹 Client Portal Fields (Phase 1)
  @Column({ type: 'int', nullable: true })
  projectId?: number; // Associer notification à un projet

  @Column({ type: 'int', nullable: true })
  ticketId?: number; // Associer notification à une demande client

  @Column({ type: 'int', nullable: true })
  documentId?: number; // Associer notification à un document

  @Column({ type: 'varchar', length: 500, nullable: true })
  actionUrl?: string; // URL pour action rapide (ex: /projects/123/requests/456)

  @Column({ default: false })
  isRead: boolean;

  @CreateDateColumn()
  createdAt: Date;

  // Relation
  @ManyToOne(() => User, (u) => u.notifications, { onDelete: 'CASCADE' })
  user: User;
}
