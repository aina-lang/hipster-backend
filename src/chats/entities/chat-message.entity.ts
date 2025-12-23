import { Ticket } from 'src/tickets/entities/ticket.entity';
import { User } from 'src/users/entities/user.entity';
import { ChatRoom } from './chat-room.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  content: string;

  @Column({
    type: 'enum',
    enum: ['client', 'employee'],
  })
  senderType: 'client' | 'employee';

  @Column({ type: 'json', nullable: true })
  attachments?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  // Relations
  @ManyToOne(() => Ticket, (t) => t.messages, { nullable: true })
  ticket?: Ticket;

  @ManyToOne(() => User, { onDelete: 'CASCADE' }) // Unidirectional from Message -> User
  user: User;

  @ManyToOne(() => ChatRoom, (room) => room.messages, { onDelete: 'CASCADE' })
  room: ChatRoom;
}
