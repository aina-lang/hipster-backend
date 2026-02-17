import {
  IsEmail,
  IsNotEmpty,
  MinLength,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { ClientType } from 'src/common/enums/client.enum';
import { Role } from 'src/common/enums/role.enum';

export class RegisterAuthDto {
  @IsNotEmpty({ message: 'Le prénom est obligatoire' })
  @IsString({ message: 'Le prénom doit être une chaîne de caractères' })
  firstName: string;

  @IsNotEmpty({ message: 'Le nom est obligatoire' })
  @IsString({ message: 'Le nom doit être une chaîne de caractères' })
  lastName: string;

  @IsEmail({}, { message: 'Adresse email invalide' })
  @IsNotEmpty({ message: 'L\'email est obligatoire' })
  email: string;

  @MinLength(6, {
    message: 'Le mot de passe doit contenir au moins 6 caractères',
  })
  @IsNotEmpty({ message: 'Le mot de passe est obligatoire' })
  @IsString({ message: 'Le mot de passe doit être une chaîne de caractères' })
  password: string;

  @IsEnum(Role, {
    message: 'Le rôle doit être client_marketing',
  })
  @IsNotEmpty({ message: 'Le profil est obligatoire' })
  selectedProfile: Role;

  @IsOptional()
  @IsString({ each: true, message: 'Chaque téléphone doit être une chaîne de caractères' })
  phones?: string[];

  @IsEnum(ClientType, {
    message: 'Le type de client doit être individual ou company',
  })
  @IsOptional()
  clientType?: ClientType;

  @IsOptional()
  @IsString({ message: 'Le nom de l\'entreprise doit être une chaîne de caractères' })
  companyName?: string;

  @IsOptional()
  @IsString({ message: 'L\'URL de l\'avatar doit être une chaîne de caractères' })
  avatarUrl?: string;

  @IsOptional()
  @IsString({ message: 'Le code de parrainage doit être une chaîne de caractères' })
  referralCode?: string;
}
