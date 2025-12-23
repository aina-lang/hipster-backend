import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsNumber, IsOptional } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { ProjectStatus } from '../entities/project.entity';

const PROJECT_SORTABLE_FIELDS = [
  'id',
  'createdAt',
  'start_date',
  'end_date',
  'status',
  'budget',
] as const;

export class FindProjectsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ProjectStatus, { message: 'status invalide' })
  status?: ProjectStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  clientId?: number;

  @IsOptional()
  @IsIn(PROJECT_SORTABLE_FIELDS)
  sortBy?: (typeof PROJECT_SORTABLE_FIELDS)[number];
}
