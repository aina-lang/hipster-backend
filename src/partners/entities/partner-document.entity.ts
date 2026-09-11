import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Partner } from './partner.entity';
import { User } from 'src/users/entities/user.entity';

export enum PartnerDocumentType {
  CONTRAT = 'contrat',
  DOCUMENT_UTILE = 'document_utile',
}

/**
 * 📎 PARTNER DOCUMENT (document attaché à la fiche du partenaire, ex. contrat)
 * Distinct de DealDocument, qui s'attache à une affaire précise.
 */
@Entity('partner_documents')
export class PartnerDocument {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Partner, (p) => p.documents, { onDelete: 'CASCADE' })
  partner: Partner;

  @Column({
    type: 'enum',
    enum: PartnerDocumentType,
    default: PartnerDocumentType.DOCUMENT_UTILE,
  })
  type: PartnerDocumentType;

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
