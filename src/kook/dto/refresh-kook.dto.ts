import { IsEmail, IsString } from 'class-validator';

export class RefreshKookDto {
  @IsEmail()
  email: string;

  @IsString()
  refreshToken: string;
}
