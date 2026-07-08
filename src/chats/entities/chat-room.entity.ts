import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { ChatMessage } from './chat-message.entity';

@Entity('chat_rooms')
export class ChatRoom {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  name?: string;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => ClientProfile, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_profile_id' })
  client: ClientProfile;

  @Column()
  clientProfileId: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToMany(() => User, (user) => user.chatRooms)
  participants: User[];

  @OneToMany(() => ChatMessage, (message) => message.room, { cascade: true })
  messages: ChatMessage[];
}
