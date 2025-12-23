import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class LoginAuthDto {
  @IsEmail({}, { message: "L'adresse e-mail fournie n'est pas valide." })
  @IsNotEmpty({ message: "L'adresse e-mail est requise." })
  email: string;

  @IsNotEmpty({ message: 'Le mot de passe est requis.' })
  @MinLength(6, {
    message: 'Le mot de passe doit contenir au moins 6 caractères.',
  })
  password: string;
}
