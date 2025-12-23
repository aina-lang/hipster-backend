import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('permissions')
export class Permission {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    slug: string; // e.g., 'create:user', 'read:report'

    @Column()
    description: string; // e.g., 'Can create users'
}
