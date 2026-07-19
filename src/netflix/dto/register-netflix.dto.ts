import { IsString, IsNotEmpty, Matches, IsOptional, IsIn } from 'class-validator';
import { NetflixUserType } from '../entities/netflix-user.entity';

export class RegisterNetflixDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[0-9]{8,15}$/, { message: 'Numéro de téléphone invalide.' })
  phone: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsIn([NetflixUserType.VIEWER, NetflixUserType.CREATOR])
  userType?: NetflixUserType;
}
