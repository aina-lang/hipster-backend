import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreatePartnerDto {
  @IsString()
  @IsNotEmpty()
  agencyName: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  speciality?: string;

  @IsOptional()
  @IsString()
  geographicZone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Créer un compte d'accès à l'espace partenaire */
  @IsOptional()
  @IsBoolean()
  hasPortalAccess?: boolean;
}
