import {
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  IsString,
} from 'class-validator';
import { TicketPriority, TicketStatus } from '../entities/ticket.entity';

export class CreateTicketDto {
  // --- Infos principales ---
  @IsNotEmpty({ message: 'Le sujet du ticket est obligatoire' })
  @IsString()
  subject: string;

  @IsNotEmpty({ message: 'La description du ticket est obligatoire' })
  @IsString()
  description: string;

  @IsEnum(TicketPriority, { message: 'Priorité invalide' })
  @IsOptional()
  priority?: TicketPriority;

  @IsEnum(TicketStatus, { message: 'Statut invalide' })
  @IsOptional()
  status?: TicketStatus;

  // --- Relations ---
  @IsNotEmpty({ message: 'Le client est obligatoire' })
  @IsInt()
  clientId: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  assigneeIds?: number[];

  @IsOptional()
  @IsInt()
  projectId?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  fileIds?: number[];
}
