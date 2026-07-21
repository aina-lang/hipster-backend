import { IsEmail, IsString, Matches } from 'class-validator';

export class VerifyOtpKookDto {
  @IsEmail()
  email: string;

  @IsString()
  @Matches(/^[0-9]{4,8}$/)
  code: string;
}
