import { PartialType } from '@nestjs/swagger';
import { CreateCampaignDto } from './create-campaign.dto';
import { IsNumber, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCampaignDto extends PartialType(CreateCampaignDto) {
    @ApiPropertyOptional({ description: 'Nombre d\'envois réussis' })
    @IsOptional()
    @IsNumber()
    sent?: number;

    @ApiPropertyOptional({ description: 'Nombre d\'ouvertures' })
    @IsOptional()
    @IsNumber()
    opened?: number;

    @ApiPropertyOptional({ description: 'Nombre de clics' })
    @IsOptional()
    @IsNumber()
    clicked?: number;
}
