import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class VerifyOtpNetflixDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[0-9]{8,15}$/, { message: 'Numéro de téléphone invalide.' })
  phone: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]{4,8}$/, { message: 'Code invalide.' })
  code: string;
}
