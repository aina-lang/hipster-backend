import { IsEmail, IsString, IsNotEmpty } from 'class-validator';

export class RefreshKookDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
