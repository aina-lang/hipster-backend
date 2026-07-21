import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('kook_categories')
export class RecipeCategory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  slug?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;
}
