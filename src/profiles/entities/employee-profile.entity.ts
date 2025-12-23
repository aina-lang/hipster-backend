import { ChatMessage } from 'src/chats/entities/chat-message.entity';
import { ProjectMember } from 'src/projects/entities/project-member.entity';
import { Task } from 'src/tasks/entities/task.entity';
import { User } from 'src/users/entities/user.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToMany,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('employee_profiles')
export class EmployeeProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  poste: string;

  @Column({ nullable: true })
  contactEmail?: string;

  @Column({ nullable: true })
  address?: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ nullable: true })
  zipCode?: string;

  @Column({ nullable: true })
  country?: string;

  // Bank Details
  @Column({ nullable: true })
  iban?: string;

  @Column({ nullable: true })
  bic?: string;

  @Column({ nullable: true })
  bankName?: string;

  // 🔗 Relation principale avec User
  @OneToOne(() => User, (u) => u.employeeProfile, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  // ✅ ManyToMany avec Task (symétrique)
  @ManyToMany(() => Task, (t) => t.assignees)
  tasks: Task[];

  // 🔗 Messages envoyés dans les salons de chat
  @OneToMany(() => ChatMessage, (m) => m.user)
  chatMessages: ChatMessage[];
}
