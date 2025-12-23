import {
  IsNotEmpty,
  IsString,
  IsOptional,
} from 'class-validator';

export class CreateEmployeeProfileDto {
  @IsNotEmpty()
  @IsString()
  poste: string;

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
  iban?: string;

  @IsOptional()
  @IsString()
  bic?: string;

  @IsOptional()
  @IsString()
  bankName?: string;
}
