import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateNotificationDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isRead?: boolean = false;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  data?: any;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId: number;
}
