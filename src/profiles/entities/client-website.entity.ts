import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClientProfile } from './client-profile.entity';
import { User } from 'src/users/entities/user.entity';

/**
 * CLIENT WEBSITE ENTITY
 * Manages multiple websites for a single client
 */
@Entity('client_websites')
export class ClientWebsite {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  @Column({ type: 'varchar', length: 255 })
  adminLogin: string;

  @Column({ type: 'varchar', length: 255 })
  adminPassword: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  plainPassword?: string; // Store plain password for display in maintenance tasks

  @Column({ type: 'text', nullable: true })
  description?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => ClientProfile, (client) => client.websites, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'clientId' })
  client: ClientProfile;

  @Column()
  clientId: number;

  @Column({ type: 'timestamp', nullable: true })
  lastMaintenanceDate?: Date;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'lastMaintenanceById' })
  lastMaintenanceBy?: User;

  @Column({ nullable: true })
  lastMaintenanceById?: number;
}
