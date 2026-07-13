import { PartialType } from '@nestjs/mapped-types';
import { IsEnum } from 'class-validator';
import { CreateDealDto } from './create-deal.dto';
import { DealStatus } from '../entities/deal.entity';

export class UpdateDealDto extends PartialType(CreateDealDto) {}

export class UpdateDealStatusDto {
  @IsEnum(DealStatus)
  status: DealStatus;
}
