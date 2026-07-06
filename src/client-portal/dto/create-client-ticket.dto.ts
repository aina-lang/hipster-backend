import { IsNotEmpty, IsOptional, IsEnum, IsInt, IsString } from 'class-validator';
import { TicketPriority } from 'src/tickets/entities/ticket.entity';
import { RequestCategory } from 'src/common/enums/request-category.enum';

export class CreateClientTicketDto {
  @IsNotEmpty({ message: 'La catégorie est obligatoire' })
  @IsEnum(RequestCategory, { message: 'Catégorie invalide' })
  category: RequestCategory;

  @IsNotEmpty({ message: 'Le sujet est obligatoire' })
  @IsString()
  subject: string;

  @IsNotEmpty({ message: 'La description est obligatoire' })
  @IsString()
  description: string;

  @IsOptional()
  @IsInt()
  projectId?: number;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}
