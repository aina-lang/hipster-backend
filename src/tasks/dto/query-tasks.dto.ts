import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { TaskPriority, TaskStatus } from '../entities/task.entity';

const TASK_SORTABLE_FIELDS = [
  'id',
  'createdAt',
  'updatedAt',
  'dueDate',
  'status',
  'priority',
] as const;

export class QueryTasksDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  projectId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assigneeId?: number;

  @IsOptional()
  @IsIn(TASK_SORTABLE_FIELDS)
  sortBy?: (typeof TASK_SORTABLE_FIELDS)[number];

  @IsOptional()
  @IsString()
  search?: string;
}
