import { Controller, Get, Post, Body, Param, Query, ParseIntPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClientPortalService } from './client-portal.service';
import { CreateClientTicketDto } from './dto/create-client-ticket.dto';
import { QueryPortalDto } from './dto/query-portal.dto';
import { User } from 'src/common/decorators/user.decorator';
import { Roles } from 'src/common/decorators/role.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';

@ApiTags('Espace Client')
@Roles(Role.CLIENT_MARKETING)
@Controller('client-portal')
export class ClientPortalController {
  constructor(private readonly clientPortalService: ClientPortalService) {}

  @ApiOperation({ summary: 'Tableau de bord du client' })
  @Get('dashboard')
  getDashboard(@User('id') userId: number) {
    return this.clientPortalService.getDashboard(userId);
  }

  @ApiOperation({ summary: 'Liste des projets du client' })
  @Get('projects')
  getProjects(@User('id') userId: number) {
    return this.clientPortalService.getProjects(userId);
  }

  @ApiOperation({ summary: 'Détail d\'un projet' })
  @Get('projects/:id')
  getProject(
    @User('id') userId: number,
    @Param('id', ParseIntPipe) projectId: number,
  ) {
    return this.clientPortalService.getProject(userId, projectId);
  }

  @ApiOperation({ summary: 'Liste des demandes du client' })
  @Get('tickets')
  getTickets(
    @User('id') userId: number,
    @Query() query: QueryPortalDto,
  ) {
    return this.clientPortalService.getTickets(userId, query);
  }

  @ApiOperation({ summary: 'Créer une demande' })
  @ResponseMessage('Demande créée avec succès')
  @Post('tickets')
  createTicket(
    @User('id') userId: number,
    @Body() dto: CreateClientTicketDto,
  ) {
    return this.clientPortalService.createTicket(userId, dto);
  }

  @ApiOperation({ summary: 'Liste des factures/devis du client' })
  @Get('invoices')
  getInvoices(@User('id') userId: number) {
    return this.clientPortalService.getInvoices(userId);
  }

  @ApiOperation({ summary: 'Stats de CA du client' })
  @Get('invoices/stats')
  getInvoiceStats(@User('id') userId: number) {
    return this.clientPortalService.getInvoiceStats(userId);
  }

  @ApiOperation({ summary: 'Accès aux sites web / WordPress' })
  @Get('websites')
  getWebsites(@User('id') userId: number) {
    return this.clientPortalService.getWebsites(userId);
  }
}
