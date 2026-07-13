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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DealStatus } from '../entities/deal.entity';

export class CreateDealDto {
  @ApiProperty({ example: 'Refonte site internet', description: 'Nom du projet' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Site internet', description: 'Type de prestation' })
  @IsOptional()
  @IsString()
  prestationType?: string;

  @ApiPropertyOptional({ example: 'Refonte complète du site vitrine + blog' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'ID d\'un client existant (sinon fournir clientName)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clientId?: number;

  @ApiPropertyOptional({ example: 'Société Dupont', description: 'Nom d\'un nouveau client' })
  @IsOptional()
  @IsString()
  clientName?: string;

  @ApiPropertyOptional({ example: 'contact@dupont.fr' })
  @IsOptional()
  @IsString()
  clientEmail?: string;

  @ApiPropertyOptional({ example: '04 00 00 00 00' })
  @IsOptional()
  @IsString()
  clientPhone?: string;

  @ApiPropertyOptional({ example: '12 rue du Commerce, Lyon' })
  @IsOptional()
  @IsString()
  clientAddress?: string;

  @ApiPropertyOptional({
    example: 3,
    nullable: true,
    description: 'ID du partenaire apporteur. null/absent = Hipster Marketing',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  apporteurId?: number | null;

  @ApiPropertyOptional({
    example: null,
    nullable: true,
    description: 'ID du partenaire réalisateur. null/absent = Hipster Marketing',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  realisateurId?: number | null;

  @ApiProperty({ example: 1500, description: 'Montant HT du projet (€). Commission = 10 % auto' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountHT: number;

  @ApiPropertyOptional({ enum: DealStatus, example: DealStatus.NOUVELLE_AFFAIRE })
  @IsOptional()
  @IsEnum(DealStatus)
  status?: DealStatus;
}
