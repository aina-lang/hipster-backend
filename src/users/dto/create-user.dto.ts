import {
  IsEmail,
  IsEnum,
  IsOptional,
  MinLength,
  IsArray,
  ArrayNotEmpty,
  ValidateNested,
  IsNotEmpty,
  IsString,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateClientProfileDto } from 'src/profiles/dto/create-client-profile.dto';
import { CreateEmployeeProfileDto } from 'src/profiles/dto/create-employee-profile.dto';
import { Role } from 'src/common/enums/role.enum';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsNotEmpty()
  firstName: string;

  @IsNotEmpty()
  lastName: string;

  @IsOptional()
  avatarUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  phones?: string[];

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(Role, { each: true })
  roles?: Role[];

  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  zipCode?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  siret?: string;

  @IsOptional()
  @IsString()
  tvaNumber?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  iban?: string;

  @IsOptional()
  @IsString()
  bic?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CreateClientProfileDto)
  clientProfile?: CreateClientProfileDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateEmployeeProfileDto)
  employeeProfile?: CreateEmployeeProfileDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}
