import { Column, Entity, JoinTable, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Permission } from '../../permissions/entities/permission.entity';

@Entity('roles_entities') // Avoid conflict with 'roles' table if it exists or reserved words
export class RoleEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    name: string; // e.g., 'Manager', 'Editor'

    @Column({ nullable: true })
    description: string;

    @ManyToMany(() => Permission)
    @JoinTable()
    permissions: Permission[];
}
