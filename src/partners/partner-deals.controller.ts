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
import { extname, join } from 'path';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PartnersService, RequestUser } from './partners.service';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto, UpdateDealStatusDto } from './dto/update-deal.dto';
import { QueryDealsDto } from './dto/query-deals.dto';
import { DealDocumentType } from './entities/deal-document.entity';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';

const uploadInterceptor = FileInterceptor('file', {
  storage: diskStorage({
    destination: (req, file, cb) => {
      cb(null, process.env.UPLOAD_PATH || join(process.cwd(), 'uploads'));
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

@ApiTags('Partner Deals')
@ApiBearerAuth()
@Controller('partner-deals')
export class PartnerDealsController {
  constructor(private readonly partnersService: PartnersService) {}

  private ctx(req: any): RequestUser {
    return { userId: req.user.userId, roles: req.user.roles };
  }

  /** 💼 Créer une nouvelle affaire (admin ou partenaire) */
  @ApiOperation({ summary: 'Créer une affaire' })
  @ResponseMessage('Affaire créée avec succès')
  @Post()
  create(@Body() dto: CreateDealDto, @Request() req) {
    return this.partnersService.createDeal(dto, this.ctx(req));
  }

  /** 📋 Liste des affaires (scopée par rôle) */
  @ApiOperation({ summary: 'Liste des affaires' })
  @Get()
  findAll(@Query() query: QueryDealsDto, @Request() req) {
    return this.partnersService.findDeals(query, this.ctx(req));
  }

  /** 🔍 Détail d'une affaire */
  @ApiOperation({ summary: 'Détail affaire' })
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.partnersService.findOneDeal(+id, this.ctx(req));
  }

  /** ✏️ Modifier une affaire */
  @ApiOperation({ summary: 'Modifier une affaire' })
  @ResponseMessage('Affaire mise à jour')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDealDto, @Request() req) {
    return this.partnersService.updateDeal(+id, dto, this.ctx(req));
  }

  /** 🔄 Changer le statut d'une affaire */
  @ApiOperation({ summary: "Changer le statut d'une affaire" })
  @ResponseMessage('Statut mis à jour')
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDealStatusDto,
    @Request() req,
  ) {
    return this.partnersService.updateStatus(+id, dto.status, this.ctx(req));
  }

  // ------------------- Documents -------------------

  /** 📎 Uploader un document sur l'affaire */
  @ApiOperation({ summary: 'Ajouter un document à une affaire' })
  @ApiConsumes('multipart/form-data')
  @ResponseMessage('Document ajouté')
  @Post(':id/documents')
  @UseInterceptors(uploadInterceptor)
  async addDocument(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { type?: DealDocumentType },
    @Request() req,
  ) {
    if (!file) throw new BadRequestException('Fichier manquant');
    return this.partnersService.addDocument(
      +id,
      {
        originalName: file.originalname,
        filename: file.filename,
        url: `/uploads/${file.filename}`,
        mimeType: file.mimetype,
        size: file.size,
      },
      (body.type as DealDocumentType) || DealDocumentType.DOCUMENT_UTILE,
      this.ctx(req),
    );
  }

  /** 📎 Liste des documents d'une affaire */
  @ApiOperation({ summary: "Documents d'une affaire" })
  @Get(':id/documents')
  listDocuments(@Param('id') id: string, @Request() req) {
    return this.partnersService.listDocuments(+id, this.ctx(req));
  }

  /** 🗑️ Supprimer un document */
  @ApiOperation({ summary: 'Supprimer un document' })
  @ResponseMessage('Document supprimé')
  @Delete('documents/:docId')
  removeDocument(@Param('docId') docId: string, @Request() req) {
    return this.partnersService.removeDocument(+docId, this.ctx(req));
  }
}
