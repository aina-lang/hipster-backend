import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { InvoiceStatus, InvoiceType } from '../entities/invoice.entity';

class CreateInvoiceItemDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  @IsPositive()
  quantity: number;

  @IsNumber()
  @IsPositive()
  unitPrice: number;

  @IsString()
  @IsOptional()
  unit?: string;
}

export class CreateInvoiceDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional() // Generated automatically if not provided
  reference?: string;

  @IsEnum(InvoiceType)
  type: InvoiceType = InvoiceType.INVOICE;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsEnum(InvoiceStatus)
  @IsOptional()
  status?: InvoiceStatus = InvoiceStatus.PENDING;

  @Type(() => Number)
  @IsPositive()
  clientId: number;

  @Type(() => Number)
  @IsPositive()
  projectId: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items: CreateInvoiceItemDto[];

  @IsBoolean()
  @IsOptional()
  tva?: boolean;

  @IsNumber()
  @IsOptional()
  discount?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  terms?: string;

  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  pdfUrl?: string;
}
