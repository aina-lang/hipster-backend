import {
  IsEmail,
  IsNotEmpty,
  MinLength,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { ClientType } from 'src/common/enums/client.enum';
import { Role } from 'src/common/enums/role.enum';

export class RegisterAuthDto {
  @IsNotEmpty({ message: 'Le prénom est obligatoire' })
  firstName: string;

  @IsNotEmpty({ message: 'Le nom est obligatoire' })
  lastName: string;

  @IsEmail({}, { message: 'Adresse email invalide' })
  email: string;

  @MinLength(6, {
    message: 'Le mot de passe doit contenir au moins 6 caractères',
  })
  password: string;

  @IsEnum(Role, {
    message: 'Le rôle doit être client_marketing ou client_ai',
  })
  @IsNotEmpty({ message: 'Le profil est obligatoire' })
  selectedProfile: Role;

  @IsOptional()
  phones?: string[];

  @IsEnum(ClientType, {
    message: 'Le type de client doit être individual ou company',
  })
  @IsOptional()
  clientType?: ClientType;

  @IsOptional()
  companyName?: string;

  @IsOptional()
  avatarUrl?: string;

  @IsOptional()
  referralCode?: string;
}
