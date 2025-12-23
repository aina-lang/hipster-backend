import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import {
  PaymentProvider,
  PaymentStatus,
  PaymentType,
} from '../entities/payment.entity';

const PAYMENT_SORTABLE_FIELDS = [
  'id',
  'createdAt',
  'amount',
  'status',
] as const;

export class QueryPaymentsDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(PaymentType)
  paymentType?: PaymentType;

  @IsOptional()
  @IsEnum(PaymentProvider)
  provider?: PaymentProvider;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clientId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  projectId?: number;

  @IsOptional()
  @IsIn(PAYMENT_SORTABLE_FIELDS)
  sortBy?: (typeof PAYMENT_SORTABLE_FIELDS)[number];

  @IsOptional()
  @IsString()
  search?: string;
}
