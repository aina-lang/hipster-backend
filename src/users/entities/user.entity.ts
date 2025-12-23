import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Role } from 'src/common/enums/role.enum';
import { ChatRoom } from 'src/chats/entities/chat-room.entity';
import { Payment } from 'src/payments/entities/payment.entity';
import { AiSubscriptionProfile } from 'src/profiles/entities/ai-subscription-profile.entity';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { EmployeeProfile } from 'src/profiles/entities/employee-profile.entity';
import { Notification } from 'src/notifications/entities/notification.entity';
import { Otp } from 'src/otp/enitities/otp.entity';
import { Permission } from 'src/permissions/entities/permission.entity';

/**
 * 🧩 USER ENTITY
 * But : base unique pour l'authentification et la gestion multi-rôles.
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  avatarUrl?: string;

  @Column({ type: 'simple-array', nullable: true })
  phones?: string[];

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  contactEmail?: string;

  @Column()
  password: string;

  @Column({ type: 'simple-array', nullable: false })
  roles: Role[];

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column({ nullable: true, type: 'text' })
  refreshToken?: string | null;

  @Column({ nullable: true, type: 'timestamp' })
  refreshTokenExpiresAt?: Date | null;

  @Column({ nullable: true })
  referralCode?: string;

  @Column({ nullable: true })
  referredBy?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /** Profil client marketing */
  @OneToOne(() => ClientProfile, (p) => p.user, {
    cascade: true,
    nullable: true,
  })
  clientProfile?: ClientProfile;

  /** Profil IA */
  @OneToOne(() => AiSubscriptionProfile, (p) => p.user, {
    cascade: true,
    nullable: true,
  })
  aiProfile?: AiSubscriptionProfile;

  /** Profil employé */
  @OneToOne(() => EmployeeProfile, (p) => p.user, {
    cascade: true,
    nullable: true,
  })
  employeeProfile?: EmployeeProfile;

  // -----------------------------
  // 🔗 RELATIONS 1–N
  // -----------------------------

  @OneToMany(() => Payment, (p) => p.user)
  payments: Payment[];

  @ManyToMany(() => ChatRoom, (room) => room.participants)
  @JoinTable({
    name: 'chat_room_participants',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'chat_room_id', referencedColumnName: 'id' },
  })
  chatRooms: ChatRoom[];

  @OneToMany(() => Notification, (n) => n.user)
  notifications: Notification[];

  @OneToMany(() => Otp, (otp) => otp.user)
  otps: Otp[];

  // -----------------------------
  // 🔗 Permissions - Fine-grained access control
  // -----------------------------

  @ManyToMany(() => Permission)
  @JoinTable({
    name: 'user_permissions',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permission_id', referencedColumnName: 'id' },
  })
  permissions: Permission[];
}
