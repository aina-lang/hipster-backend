import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';


@Entity('roles_entities') // Avoid conflict with 'roles' table if it exists or reserved words
export class RoleEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string; // e.g., 'Manager', 'Editor'

  @Column({ nullable: true })
  description: string;

}
