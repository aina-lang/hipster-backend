import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CampaignStatus, CampaignType } from '../entities/campaign.entity';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export class QueryCampaignsDto extends PaginationQueryDto {
    @ApiPropertyOptional({ enum: CampaignStatus, description: 'Filtrer par statut' })
    @IsOptional()
    @IsEnum(CampaignStatus)
    status?: CampaignStatus;

    @ApiPropertyOptional({ enum: CampaignType, description: 'Filtrer par type' })
    @IsOptional()
    @IsEnum(CampaignType)
    type?: CampaignType;

    @ApiPropertyOptional({ description: 'Filtrer par date de début (après)' })
    @IsOptional()
    @IsDateString()
    startDateFrom?: string;

    @ApiPropertyOptional({ description: 'Filtrer par date de début (avant)' })
    @IsOptional()
    @IsDateString()
    startDateTo?: string;
}
