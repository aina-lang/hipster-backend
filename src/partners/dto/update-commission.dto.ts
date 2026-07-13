import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommissionStatus } from '../entities/commission.entity';

export class UpdateCommissionStatusDto {
  @ApiProperty({ enum: CommissionStatus, example: CommissionStatus.PAYEE })
  @IsEnum(CommissionStatus)
  status: CommissionStatus;
}

export class UpdateCommissionDto {
  @ApiPropertyOptional({ enum: CommissionStatus, example: CommissionStatus.A_FACTURER })
  @IsOptional()
  @IsEnum(CommissionStatus)
  status?: CommissionStatus;

  @ApiPropertyOptional({ example: '2026-07-13', description: 'Date d\'exigibilité' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ example: '2026-07-20', description: 'Date de paiement' })
  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @ApiPropertyOptional({ example: 'FA-COM-2026-001', description: 'Référence de la facture de commission' })
  @IsOptional()
  @IsString()
  invoiceReference?: string;
}
