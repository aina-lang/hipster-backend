import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateClientWebsiteDto {
  @IsNotEmpty()
  @IsUrl({}, { message: 'URL invalide' })
  url: string;

  @IsNotEmpty()
  @IsString()
  adminLogin: string;

  @IsNotEmpty()
  @IsString()
  adminPassword: string;

  @IsOptional()
  @IsString()
  description?: string;
}
