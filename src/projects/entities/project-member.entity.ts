import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { Project } from './project.entity';

export enum ProjectRole {
  // 🔹 Gestion / coordination
  PROJECT_OWNER = 'PROJECT_OWNER',
  PROJECT_MANAGER = 'PROJECT_MANAGER',
  ACCOUNT_MANAGER = 'ACCOUNT_MANAGER',
  CLIENT_CONTACT = 'CLIENT_CONTACT',

  // 🔹 Création / production
  DESIGNER = 'DESIGNER',
  UX_UI_DESIGNER = 'UX_UI_DESIGNER',
  GRAPHIC_DESIGNER = 'GRAPHIC_DESIGNER',
  CONTENT_CREATOR = 'CONTENT_CREATOR',
  COPYWRITER = 'COPYWRITER',

  // 🔹 Développement / technique
  DEVELOPER = 'DEVELOPER',
  FRONTEND_DEV = 'FRONTEND_DEV',
  BACKEND_DEV = 'BACKEND_DEV',
  FULLSTACK_DEV = 'FULLSTACK_DEV',
  MOBILE_DEV = 'MOBILE_DEV',

  // 🔹 Marketing / communication
  MARKETER = 'MARKETER',
  SEO_SPECIALIST = 'SEO_SPECIALIST',
  ADS_MANAGER = 'ADS_MANAGER',
  SOCIAL_MEDIA_MANAGER = 'SOCIAL_MEDIA_MANAGER',
  EMAIL_MARKETING = 'EMAIL_MARKETING',

  // 🔹 Qualité / test / support
  TESTER = 'TESTER',
  QA_ENGINEER = 'QA_ENGINEER',
  SUPPORT = 'SUPPORT',
  CUSTOMER_SUCCESS = 'CUSTOMER_SUCCESS',

  // 🔹 Autres rôles polyvalents
  CONSULTANT = 'CONSULTANT',
  ANALYST = 'ANALYST',
  PHOTOGRAPHER = 'PHOTOGRAPHER',
  VIDEOGRAPHER = 'VIDEOGRAPHER',
  INTERN = 'INTERN',
}

@Entity('project_members')
@Unique(['project', 'employee'])
export class ProjectMember {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Project, (project) => project.members, {
    onDelete: 'CASCADE',
  })
  project: Project;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  employee: User;

  @Column({
    type: 'enum',
    enum: ProjectRole,
    default: ProjectRole.DEVELOPER,
  })
  role: ProjectRole;

  @CreateDateColumn()
  joinedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
