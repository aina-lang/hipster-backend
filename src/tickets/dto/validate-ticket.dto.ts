import { IsEnum, IsArray, IsNumber, IsOptional, IsString } from 'class-validator';
import { TicketStatus } from '../entities/ticket.entity';

export class ValidateTicketDto {
  @IsEnum(TicketStatus)
  status: TicketStatus;

  /** Members to assign if the ticket is accepted */
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  assigneeIds?: number[];

  @IsOptional()
  @IsString()
  reason?: string;
}
