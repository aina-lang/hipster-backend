import { IsEmail, IsNotEmpty, IsOptional, IsString, IsIn } from 'class-validator';
import { NetflixUserType } from '../entities/netflix-user.entity';

export class RegisterNetflixDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

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
