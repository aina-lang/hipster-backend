import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Deal } from './deal.entity';
import { User } from 'src/users/entities/user.entity';

export enum DealDocumentType {
  DEVIS = 'devis',
  DEVIS_SIGNE = 'devis_signe',
  FACTURE_ACOMPTE = 'facture_acompte',
  FACTURE_FINALE = 'facture_finale',
  DOCUMENT_UTILE = 'document_utile',
}

/**
 * 📎 DEAL DOCUMENT (document attaché à une affaire)
 */
@Entity('deal_documents')
export class DealDocument {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Deal, (d) => d.documents, { onDelete: 'CASCADE' })
  deal: Deal;

  @Column({
    type: 'enum',
    enum: DealDocumentType,
    default: DealDocumentType.DOCUMENT_UTILE,
  })
  type: DealDocumentType;

  @Column()
  originalName: string;

  @Column()
  filename: string;

  @Column()
  url: string;

  @Column({ nullable: true })
  mimeType?: string;

  @Column({ type: 'int', nullable: true })
  size?: number;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  uploadedBy?: User | null;

  @CreateDateColumn()
  uploadedAt: Date;
}
