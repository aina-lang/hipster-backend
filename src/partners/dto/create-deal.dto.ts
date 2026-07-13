import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DealStatus } from '../entities/deal.entity';

export class CreateDealDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  prestationType?: string;

  @IsOptional()
  @IsString()
  description?: string;

  // --- Client : soit un client existant (clientId), soit un nouveau (clientName) ---
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clientId?: number;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsString()
  clientEmail?: string;

  @IsOptional()
  @IsString()
  clientPhone?: string;

  @IsOptional()
  @IsString()
  clientAddress?: string;

  /** Apporteur (partenaire). null/absent = Hipster Marketing */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  apporteurId?: number | null;

  /** Réalisateur (partenaire). null/absent = Hipster Marketing */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  realisateurId?: number | null;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountHT: number;

  @IsOptional()
  @IsEnum(DealStatus)
  status?: DealStatus;
}
