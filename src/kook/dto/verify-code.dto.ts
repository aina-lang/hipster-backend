import { IsString, IsEmail, IsNotEmpty, IsEnum } from 'class-validator';

export class VerifyCodeDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  code: string;
}
