import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { InvoiceStatus, InvoiceType } from '../entities/invoice.entity';

const INVOICE_SORTABLE_FIELDS = [
  'id',
  'createdAt',
  'dueDate',
  'amount',
  'status',
] as const;

export class QueryInvoicesDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsEnum(InvoiceType)
  type?: InvoiceType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clientId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  projectId?: number;

  @IsOptional()
  @IsIn(INVOICE_SORTABLE_FIELDS)
  sortBy?: (typeof INVOICE_SORTABLE_FIELDS)[number];

  @IsOptional()
  @IsString()
  search?: string;
}
