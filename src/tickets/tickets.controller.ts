import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { QueryTicketsDto } from './dto/query-tickets.dto';
import { TicketPriority, TicketStatus } from './entities/ticket.entity';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPaginationQueries } from 'src/common/decorators/api-pagination-query.decorator';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { ValidateTicketDto } from './dto/validate-ticket.dto';
import { User } from 'src/common/decorators/user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { Role } from 'src/common/enums/role.enum';

@ApiTags('Tickets')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @ApiOperation({ summary: 'Créer un ticket' })
  @ResponseMessage('Ticket créé avec succès')
  @Post()
  create(@Body() createTicketDto: CreateTicketDto) {
    return this.ticketsService.create(createTicketDto);
  }

  @ApiOperation({ summary: 'Lister les tickets' })
  @ApiPaginationQueries([
    { name: 'status', required: false, enum: TicketStatus },
    { name: 'priority', required: false, enum: TicketPriority },
    { name: 'clientId', required: false, type: Number },
    { name: 'projectId', required: false, type: Number },
  ])
  @Get()
  findAll(@Query() query: QueryTicketsDto) {
    return this.ticketsService.findPaginated(query);
  }

  @ApiOperation({ summary: 'Récupérer un ticket par ID' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ticketsService.findOne(+id);
  }

  @ApiOperation({ summary: 'Mettre à jour un ticket' })
  @ResponseMessage('Ticket mis à jour avec succès')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTicketDto: UpdateTicketDto) {
    return this.ticketsService.update(+id, updateTicketDto);
  }

  @ApiOperation({ summary: 'Valider ou refuser un ticket' })
  @ResponseMessage('Ticket validé/refusé avec succès')
  @Roles(Role.ADMIN)
  @Post(':id/validate')
  validate(
    @Param('id') id: string,
    @Body() dto: ValidateTicketDto,
    @User('id') adminId: number,
  ) {
    return this.ticketsService.validateTicket(+id, dto, adminId);
  }

  @ApiOperation({ summary: 'Supprimer un ticket' })
  @ResponseMessage('Ticket supprimé avec succès')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ticketsService.remove(+id);
  }
}
