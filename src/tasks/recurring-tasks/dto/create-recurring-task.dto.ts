import { IsBoolean, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { TaskPriority } from 'src/tasks/entities/task.entity';

export class CreateRecurringTaskDto {
  @IsString()
  cronExpression: string;

  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @IsInt()
  projectId: number;

  @IsInt()
  @IsOptional()
  assigneeId?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
