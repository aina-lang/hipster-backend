import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { TicketPriority, TicketStatus } from '../entities/ticket.entity';

const TICKET_SORTABLE_FIELDS = [
  'id',
  'createdAt',
  'updatedAt',
  'priority',
  'status',
] as const;

export class QueryTicketsDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clientId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  projectId?: number;

  @IsOptional()
  @IsIn(TICKET_SORTABLE_FIELDS)
  sortBy?: (typeof TICKET_SORTABLE_FIELDS)[number];

  @IsOptional()
  @IsString()
  search?: string;
}
