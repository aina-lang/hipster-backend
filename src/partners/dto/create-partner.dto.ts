import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePartnerDto {
  @ApiProperty({ example: "Com'Plus", description: "Nom de l'agence partenaire" })
  @IsString()
  @IsNotEmpty()
  agencyName: string;

  @ApiPropertyOptional({ example: 'Camille Prévost', description: 'Nom du contact' })
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiProperty({ example: 'contact@complus.fr', description: 'Email (sert d\'identifiant de connexion)' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '01 23 45 67 89' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'Réseaux sociaux' })
  @IsOptional()
  @IsString()
  speciality?: string;

  @ApiPropertyOptional({ example: 'Lyon' })
  @IsOptional()
  @IsString()
  geographicZone?: string;

  @ApiPropertyOptional({ example: true, default: true, description: 'Statut actif/inactif' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    example: true,
    default: false,
    description: "Créer le compte d'accès à l'espace partenaire (envoi des identifiants par e-mail)",
  })
  @IsOptional()
  @IsBoolean()
  hasPortalAccess?: boolean;
}
