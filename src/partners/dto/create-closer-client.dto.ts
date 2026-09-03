import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 👤 Fiche client créée par un closer après signature d'un artisan.
 * Le client reçoit ses accès à l'espace client par email (lien de
 * définition du mot de passe) et reste rattaché au closer d'origine.
 */
export class CreateCloserClientDto {
  @ApiProperty({ example: 'Entreprise Dupont' })
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @ApiProperty({ example: 'Jean' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Dupont' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'contact@dupont.fr' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '845123976', description: 'SIREN / n° de société' })
  @IsOptional()
  @IsString()
  siren?: string;

  @ApiPropertyOptional({ example: '84512397600014' })
  @IsOptional()
  @IsString()
  siret?: string;

  @ApiPropertyOptional({ example: '06 12 34 56 78' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: '24 Rue des Artisans, 69003 Lyon' })
  @IsOptional()
  @IsString()
  address?: string;
}
