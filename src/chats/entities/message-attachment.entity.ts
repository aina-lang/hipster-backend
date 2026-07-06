import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ChatMessage } from './chat-message.entity';

/**
 * 📎 MESSAGE ATTACHMENT ENTITY
 * Pièces jointes aux messages de chat
 */
@Entity('message_attachments')
export class MessageAttachment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => ChatMessage, { onDelete: 'CASCADE' })
  message: ChatMessage;

  @Column()
  messageId: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  fileUrl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fileName?: string;

  @Column({ type: 'int', nullable: true })
  fileSize?: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  fileType?: string;

  @CreateDateColumn()
  uploadedAt: Date;
}
