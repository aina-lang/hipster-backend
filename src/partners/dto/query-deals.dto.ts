import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { DealStatus } from '../entities/deal.entity';

export class QueryDealsDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(DealStatus)
  status?: DealStatus;
}
