import { Column, Entity, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('ai_plans')
export class AiPlan {
  @PrimaryColumn({ length: 64 })
  id: string; // e.g. 'curieux', 'atelier'

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price?: number;

  @Column({ nullable: true })
  stripePriceId?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'json', nullable: true })
  features?: string[];

  @Column({ type: 'tinyint', default: 0 })
  popular?: boolean;

  @Column({ type: 'tinyint', default: 1 })
  active?: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;
}
