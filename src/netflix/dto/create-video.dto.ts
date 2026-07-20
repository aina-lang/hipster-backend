import { IsString, IsNotEmpty, IsOptional, IsEnum, IsInt, IsBoolean, Min } from 'class-validator';
import { NetflixVideoVisibility, NetflixVideoType } from '../entities/netflix-video.entity';

export class CreateVideoDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(NetflixVideoType)
  videoType?: NetflixVideoType;

  @IsOptional()
  @IsInt()
  @Min(1)
  seasonNumber?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  episodeNumber?: number;

  @IsOptional()
  @IsInt()
  seriesId?: number;

  @IsOptional()
  @IsEnum(NetflixVideoVisibility)
  visibility?: NetflixVideoVisibility;

  @IsOptional()
  @IsBoolean()
  isPremium?: boolean;
}
