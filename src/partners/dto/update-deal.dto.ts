import { PartialType } from '@nestjs/mapped-types';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { CreateDealDto } from './create-deal.dto';
import { DealStatus } from '../entities/deal.entity';

export class UpdateDealDto extends PartialType(CreateDealDto) {}

export class UpdateDealStatusDto {
  @ApiProperty({ enum: DealStatus, example: DealStatus.DEVIS_ACCEPTE })
  @IsEnum(DealStatus)
  status: DealStatus;
}
