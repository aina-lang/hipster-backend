import {
  IsEmail,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  ValidateIf,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateClientProfileDto } from 'src/profiles/dto/create-client-profile.dto';
import { UpdateClientProfileDto } from '../../profiles/dto/update-client-profile.dto';

export class UpdateUserProfileDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  phones?: string[];

  @IsOptional()
  @ValidateIf((o, v) => v !== '' && v !== null)
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateClientProfileDto)
  clientProfile?: UpdateClientProfileDto;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
