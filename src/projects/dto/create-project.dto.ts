import {
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsInt,
  ValidateNested,
  IsDateString,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProjectRole } from '../entities/project-member.entity';
import type { MaintenanceConfig } from '../interfaces/maintenance-config.interface';

export class ProjectMemberInput {
  @IsInt()
  employeeId: number;

  @IsNotEmpty()
  role: ProjectRole;
}

export class CreateProjectDto {
  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  description: string;

  @IsDateString()
  start_date: string;

  @IsDateString()
  end_date: string;

  @IsOptional()
  @IsDateString()
  real_end_date?: string;

  @IsOptional()
  @IsInt()
  clientId: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectMemberInput)
  members?: ProjectMemberInput[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  fileIds?: number[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  taskIds?: number[];

  @IsOptional()
  @IsObject()
  maintenanceConfig?: MaintenanceConfig;
}
