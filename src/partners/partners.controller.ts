import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PartnersService, RequestUser } from './partners.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { Roles } from 'src/common/decorators/role.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';

@ApiTags('Partners')
@ApiBearerAuth()
@Controller('partners')
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  private ctx(req: any): RequestUser {
    return { userId: req.user.userId, roles: req.user.roles };
  }

  /** 🤝 Créer une fiche partenaire (Hipster Marketing uniquement) */
  @ApiOperation({ summary: 'Créer un partenaire (admin)' })
  @ResponseMessage('Partenaire créé avec succès')
  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreatePartnerDto) {
    return this.partnersService.createPartner(dto);
  }

  /** 📊 Tableau de bord réseau (admin) */
  @ApiOperation({ summary: 'Tableau de bord Hipster Marketing (admin)' })
  @Roles(Role.ADMIN)
  @Get('dashboard')
  adminDashboard() {
    return this.partnersService.getAdminDashboard();
  }

  /** 📊 Tableau de bord du partenaire connecté */
  @ApiOperation({ summary: 'Tableau de bord du partenaire connecté' })
  @Roles(Role.PARTNER)
  @Get('me/dashboard')
  myDashboard(@Request() req) {
    return this.partnersService.getPartnerDashboard(this.ctx(req));
  }

  /** 🪪 Fiche du partenaire connecté */
  @ApiOperation({ summary: 'Fiche du partenaire connecté' })
  @Roles(Role.PARTNER)
  @Get('me/profile')
  myProfile(@Request() req) {
    return this.partnersService.getMyPartner(this.ctx(req));
  }

  /** 👥 Liste des partenaires (admin) */
  @ApiOperation({ summary: 'Liste des partenaires (admin)' })
  @Roles(Role.ADMIN)
  @Get()
  findAll() {
    return this.partnersService.findAllPartners();
  }

  /** 👤 Liste des clients du CRM Partners */
  @ApiOperation({ summary: 'Liste des clients Partners' })
  @Get('clients')
  findClients() {
    return this.partnersService.findAllClients();
  }

  /** 🔍 Détail d'un partenaire (admin) */
  @ApiOperation({ summary: 'Détail partenaire (admin)' })
  @Roles(Role.ADMIN)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.partnersService.findOnePartner(+id);
  }

  /** ✏️ Modifier un partenaire (admin) */
  @ApiOperation({ summary: 'Modifier un partenaire (admin)' })
  @ResponseMessage('Partenaire mis à jour')
  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePartnerDto) {
    return this.partnersService.updatePartner(+id, dto);
  }

  /** 🔐 Activer / désactiver l'accès partenaire (admin) */
  @ApiOperation({ summary: "Activer/désactiver l'accès partenaire (admin)" })
  @ResponseMessage('Accès partenaire mis à jour')
  @Roles(Role.ADMIN)
  @Patch(':id/toggle-access')
  toggleAccess(@Param('id') id: string) {
    return this.partnersService.toggleAccess(+id);
  }
}
