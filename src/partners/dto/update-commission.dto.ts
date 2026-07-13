import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { CommissionStatus } from '../entities/commission.entity';

export class UpdateCommissionStatusDto {
  @IsEnum(CommissionStatus)
  status: CommissionStatus;
}

export class UpdateCommissionDto {
  @IsOptional()
  @IsEnum(CommissionStatus)
  status?: CommissionStatus;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsString()
  invoiceReference?: string;
}
