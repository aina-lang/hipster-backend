import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

const FILE_SORTABLE_FIELDS = ['id', 'uploadedAt', 'size'] as const;

export class QueryFilesDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  projectId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ticketId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  taskId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  uploaderId?: number;

  @IsOptional()
  @IsIn(FILE_SORTABLE_FIELDS)
  sortBy?: (typeof FILE_SORTABLE_FIELDS)[number];
}
