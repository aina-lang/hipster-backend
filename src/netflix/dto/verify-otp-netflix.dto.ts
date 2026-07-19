import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';

export class VerifyOtpNetflixDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]{4,8}$/, { message: 'Code invalide.' })
  code: string;
}
