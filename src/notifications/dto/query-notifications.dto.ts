import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

const NOTIFICATION_SORTABLE_FIELDS = ['id', 'createdAt', 'isRead'] as const;

export class QueryNotificationsDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isRead?: boolean;

  @IsOptional()
  @IsIn(NOTIFICATION_SORTABLE_FIELDS)
  sortBy?: (typeof NOTIFICATION_SORTABLE_FIELDS)[number];
}
