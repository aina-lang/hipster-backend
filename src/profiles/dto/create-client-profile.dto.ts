// src/profiles/dto/create-client-profile.dto.ts
import {
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsString,
  IsNumber,
  IsEmail,
  IsArray,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ClientType } from 'src/common/enums/client.enum';
import { Role } from 'src/common/enums/role.enum';

/**
 * DTO for creating a new user along with the client profile
 */
export class CreateUserDataDto {
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @IsNotEmpty()
  @IsString()
  lastName: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  password: string;

  @IsOptional()
  @IsArray()
  @IsEnum(Role, { each: true })
  roles?: Role[];

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  phones?: string[];

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
}

/**
 * DTO for creating a client profile
 * Two modes:
 * 1. Link to existing user: provide userId
 * 2. Create new user with profile: provide userData
 */
export class CreateClientProfileDto {
  // Mode 1: Link to existing user
  @ValidateIf((o) => !o.userData)
  @IsNotEmpty({ message: 'Either userId or userData must be provided' })
  @IsNumber()
  userId?: number;

  // Mode 2: Create new user with profile
  @ValidateIf((o) => !o.userId)
  @IsNotEmpty({ message: 'Either userId or userData must be provided' })
  @ValidateNested()
  @Type(() => CreateUserDataDto)
  userData?: CreateUserDataDto;

  // Client Profile Fields
  @IsOptional()
  @IsEnum(ClientType)
  clientType?: ClientType;

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
  billingAddress?: string;

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
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsNumber()
  loyaltyPoints?: number;

  @IsOptional()
  @IsNumber()
  cashbackTotal?: number;
}
