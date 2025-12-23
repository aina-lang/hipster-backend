import {
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsString,
  IsUrl,
} from 'class-validator';

export class CreateFileDto {
  @IsNotEmpty({ message: 'Le nom original du fichier est obligatoire' })
  @IsString()
  originalName: string;

  @IsNotEmpty({ message: 'Le nom de fichier est obligatoire' })
  @IsString()
  filename: string;

  @IsNotEmpty({ message: 'L’URL du fichier est obligatoire' })
  @IsUrl({}, { message: 'L’URL du fichier doit être valide' })
  url: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsInt()
  size?: number;

  @IsOptional()
  @IsInt()
  uploadedById?: number;

  @IsOptional()
  @IsInt()
  projectId?: number;

  @IsOptional()
  @IsInt()
  ticketId?: number;
}
