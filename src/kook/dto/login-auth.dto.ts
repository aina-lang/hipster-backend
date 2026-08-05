import { IsString, IsNotEmpty } from 'class-validator';

export class LoginAuthDto {
  @IsString()
  @IsNotEmpty()
  emailOrPseudo: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
