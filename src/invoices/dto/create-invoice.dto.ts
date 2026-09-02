import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsNumber,
} from 'class-validator';
import { InvoiceStatus, InvoiceType } from '../entities/invoice.entity';

export class CreateInvoiceDto {
  @IsEnum(InvoiceType)
  @IsOptional()
  type?: InvoiceType = InvoiceType.INVOICE;

  // Projet optionnel ; s'il est fourni, le client est dérivé du projet
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @IsOptional()
  projectId?: number;

  // Rattachement direct à un client quand aucun projet n'est fourni
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @IsOptional()
  clientId?: number;

  // Montant en euros (2 décimales)
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  amount?: number;

  @IsEnum(InvoiceStatus)
  @IsOptional()
  status?: InvoiceStatus = InvoiceStatus.PENDING;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  // Champs renseignés automatiquement après upload du fichier
  @IsString()
  @IsOptional()
  fileUrl?: string;

  @IsString()
  @IsOptional()
  fileName?: string;

  @IsString()
  @IsOptional()
  originalName?: string;

  @IsString()
  @IsOptional()
  mimeType?: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  fileSize?: number;
}
