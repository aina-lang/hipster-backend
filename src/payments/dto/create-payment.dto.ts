import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import {
  PaymentProvider,
  PaymentStatus,
  PaymentType,
} from '../entities/payment.entity';

export class CreatePaymentDto {
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  @IsOptional()
  currency?: string = 'EUR';

  @IsEnum(PaymentType)
  paymentType: PaymentType;

  @IsEnum(PaymentProvider)
  provider: PaymentProvider;

  @IsEnum(PaymentStatus)
  @IsOptional()
  status?: PaymentStatus = PaymentStatus.PENDING;

  @IsString()
  @IsNotEmpty()
  reference: string;

  @Type(() => Number)
  @IsPositive()
  userId: number;

  @Type(() => Number)
  @IsOptional()
  clientId?: number;

  @Type(() => Number)
  @IsOptional()
  projectId?: number;

  @Type(() => Number)
  @IsOptional()
  invoiceId?: number;
}
