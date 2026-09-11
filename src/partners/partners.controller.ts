import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { getUploadPath } from 'src/common/utils/upload-path';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PartnerDocumentType } from './entities/partner-document.entity';
import { PartnersService, RequestUser } from './partners.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { CreateCloserClientDto } from './dto/create-closer-client.dto';
import { BulkDeleteDto } from 'src/common/dto/bulk-delete.dto';
import { Roles } from 'src/common/decorators/role.decorator';
import { Role } from 'src/common/enums/role.enum';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';

const uploadInterceptor = FileInterceptor('file', {
  storage: diskStorage({
    destination: (req, file, cb) => {
      cb(null, getUploadPath());
    },
    filename: (req, file, cb) => {
      const randomName = Array(32)
        .fill(null)
        .map(() => Math.round(Math.random() * 16).toString(16))
        .join('');
      cb(null, `${randomName}${extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

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

  /** 👤 Le closer crée la fiche client d'un artisan signé */
  @ApiOperation({ summary: 'Créer un client (closer)' })
  @ResponseMessage("Client créé — l'email d'accès a été envoyé")
  @Roles(Role.PARTNER)
  @Post('me/clients')
  createMyClient(@Body() dto: CreateCloserClientDto, @Request() req) {
    return this.partnersService.createCloserClient(dto, this.ctx(req));
  }

  /** 📋 Clients signés par le closer connecté */
  @ApiOperation({ summary: 'Mes clients (closer)' })
  @Roles(Role.PARTNER)
  @Get('me/clients')
  myClients(@Request() req) {
    return this.partnersService.getMyClients(this.ctx(req));
  }

  /** 📊 Résultats du mois du closer connecté */
  @ApiOperation({ summary: 'Statistiques mensuelles du closer connecté' })
  @Roles(Role.PARTNER)
  @Get('me/closer-stats')
  myCloserStats(@Request() req, @Query('month') month?: string) {
    return this.partnersService.getMyCloserStats(this.ctx(req), month);
  }

  /** 📊 Résultats mensuels de chaque closer + total équipe (admin) */
  @ApiOperation({ summary: 'Statistiques mensuelles des closers (admin)' })
  @Roles(Role.ADMIN)
  @Get('closers/stats')
  closersStats(@Query('month') month?: string) {
    return this.partnersService.getClosersStats(month);
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

  /** 📎 Uploader un document sur la fiche du partenaire (contrat, RIB...) */
  @ApiOperation({ summary: "Ajouter un document à la fiche d'un partenaire (admin)" })
  @ApiConsumes('multipart/form-data')
  @ResponseMessage('Document ajouté')
  @Roles(Role.ADMIN)
  @Post(':id/documents')
  @UseInterceptors(uploadInterceptor)
  addDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { type?: PartnerDocumentType },
    @Request() req,
  ) {
    if (!file) throw new BadRequestException('Fichier manquant');
    return this.partnersService.addPartnerDocument(
      +id,
      {
        originalName: file.originalname,
        filename: file.filename,
        url: `/uploads/${file.filename}`,
        mimeType: file.mimetype,
        size: file.size,
      },
      (body.type as PartnerDocumentType) || PartnerDocumentType.DOCUMENT_UTILE,
      this.ctx(req),
    );
  }

  /** 📎 Documents de la fiche d'un partenaire (admin) */
  @ApiOperation({ summary: "Documents de la fiche d'un partenaire (admin)" })
  @Roles(Role.ADMIN)
  @Get(':id/documents')
  listDocuments(@Param('id') id: string, @Request() req) {
    return this.partnersService.listPartnerDocuments(+id, this.ctx(req));
  }

  /** 🗑️ Supprimer un document de la fiche partenaire (admin) */
  @ApiOperation({ summary: 'Supprimer un document de la fiche partenaire (admin)' })
  @ResponseMessage('Document supprimé')
  @Roles(Role.ADMIN)
  @Delete('documents/:docId')
  removeDocument(@Param('docId') docId: string, @Request() req) {
    return this.partnersService.removePartnerDocument(+docId, this.ctx(req));
  }

  /** 🗑️ Supprimer plusieurs partenaires (admin) */
  @ApiOperation({ summary: 'Supprimer plusieurs partenaires' })
  @ResponseMessage('Partenaires supprimés avec succès')
  @Roles(Role.ADMIN)
  @Delete('bulk')
  removeMany(@Body() dto: BulkDeleteDto) {
    return this.partnersService.removeManyPartners(dto.ids);
  }

  /** 🗑️ Supprimer un partenaire (admin) */
  @ApiOperation({ summary: 'Supprimer un partenaire' })
  @ResponseMessage('Partenaire supprimé avec succès')
  @Roles(Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.partnersService.removePartner(+id);
  }
}
