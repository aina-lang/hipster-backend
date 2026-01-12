import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from 'typeorm';
import { AiUser } from './ai-user.entity';

export enum AiGenerationType {
  TEXT = 'text',
  IMAGE = 'image',
  DOCUMENT = 'document',
  CHAT = 'chat',
}

@Entity('ai_generations')
export class AiGeneration {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'enum',
    enum: AiGenerationType,
    default: AiGenerationType.TEXT,
  })
  type: AiGenerationType;

  @Column({ nullable: true })
  title: string;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ type: 'text', nullable: true })
  result: string;

  @Column({ nullable: true })
  imageUrl?: string;

  @Column({ nullable: true })
  fileUrl?: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => AiUser, { onDelete: 'CASCADE' })
  user: AiUser;
}
