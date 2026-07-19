import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class RefreshNetflixDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
