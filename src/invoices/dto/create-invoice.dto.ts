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

  // Le document est lié à un projet ; le client est dérivé du projet
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  projectId: number;

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
