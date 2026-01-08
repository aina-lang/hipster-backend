import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CampaignStatus,
  CampaignType,
  AudienceType,
} from '../entities/campaign.entity';

export class CreateCampaignDto {
  @ApiProperty({ description: 'Nom de la campagne' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Description de la campagne' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    enum: CampaignType,
    description: 'Type de campagne',
    default: CampaignType.EMAIL,
  })
  @IsEnum(CampaignType)
  type: CampaignType;

  @ApiPropertyOptional({
    enum: CampaignStatus,
    description: 'Statut de la campagne',
    default: CampaignStatus.INACTIVE,
  })
  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;

  @ApiPropertyOptional({
    enum: AudienceType,
    description: 'Cible de la campagne',
    default: AudienceType.ALL,
  })
  @IsOptional()
  @IsEnum(AudienceType)
  audienceType?: AudienceType;

  @ApiPropertyOptional({ description: 'Date de début' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Date de fin' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Nombre de personnes ciblées' })
  @IsOptional()
  @IsNumber()
  targetAudience?: number;

  // Budget removed

  @ApiPropertyOptional({ description: 'Contenu de la campagne' })
  @IsOptional()
  @IsString()
  content?: string;
}
