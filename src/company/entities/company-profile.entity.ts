import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('company_profile')
export class CompanyProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  commercialName?: string;

  @Column({ nullable: true })
  siret?: string;

  @Column({ nullable: true })
  tvaNumber?: string;

  @Column({ nullable: true })
  address?: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ nullable: true })
  zipCode?: string;

  @Column({ nullable: true })
  country?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  website?: string;

  @Column({ nullable: true })
  bankName?: string;

  @Column({ nullable: true })
  iban?: string;

  @Column({ nullable: true })
  bic?: string;

  @Column({ nullable: true })
  logoUrl?: string;
}
