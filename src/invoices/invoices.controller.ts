import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { User } from 'src/common/decorators/user.decorator';
import { getUploadPath } from 'src/common/utils/upload-path';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPaginationQueries } from 'src/common/decorators/api-pagination-query.decorator';
import { InvoiceStatus, InvoiceType } from './entities/invoice.entity';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { BulkDeleteDto } from 'src/common/dto/bulk-delete.dto';

@ApiTags('Invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @ApiOperation({ summary: 'Uploader un devis / facture (fichier)' })
  @ResponseMessage('Document enregistré avec succès')
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
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
      limits: {
        fileSize: 25 * 1024 * 1024, // 25 MB
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() createInvoiceDto: CreateInvoiceDto,
    @User() user: any,
  ) {
    if (!file) {
      throw new BadRequestException('Fichier requis');
    }

    const fileUrl = `/uploads/${file.filename}`;

    return this.invoicesService.create(
      {
        ...createInvoiceDto,
        fileUrl,
        fileName: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
      },
      user,
    );
  }

  @ApiOperation({ summary: 'Créer un document (sans fichier)' })
  @ResponseMessage('Document créé avec succès')
  @Post()
  create(@Body() createInvoiceDto: CreateInvoiceDto, @User() user: any) {
    return this.invoicesService.create(createInvoiceDto, user);
  }

  @ApiOperation({ summary: 'Lister les documents' })
  @ApiPaginationQueries([
    { name: 'status', required: false, enum: InvoiceStatus },
    { name: 'type', required: false, enum: InvoiceType },
    { name: 'clientId', required: false, type: Number },
  ])
  @Get()
  findAll(@Query() query: QueryInvoicesDto) {
    return this.invoicesService.findPaginated(query);
  }

  @ApiOperation({ summary: 'Récupérer les stats globales de CA' })
  @Get('stats/global')
  getGlobalStats() {
    return this.invoicesService.getGlobalStats();
  }

  @ApiOperation({ summary: 'Récupérer les stats de CA pour un client' })
  @Get('stats/client/:clientId')
  getClientStats(@Param('clientId') clientId: string) {
    return this.invoicesService.getClientStats(+clientId);
  }

  @ApiOperation({ summary: 'Récupérer un document par ID' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(+id);
  }

  @ApiOperation({ summary: 'Mettre à jour un document' })
  @ResponseMessage('Document mis à jour avec succès')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateInvoiceDto: UpdateInvoiceDto,
  ) {
    return this.invoicesService.update(+id, updateInvoiceDto);
  }

  @ApiOperation({ summary: 'Mettre à jour le statut' })
  @ResponseMessage('Statut mis à jour avec succès')
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: InvoiceStatus,
  ) {
    return this.invoicesService.updateStatus(+id, status);
  }

  @ApiOperation({ summary: 'Supprimer plusieurs documents' })
  @ResponseMessage('Documents supprimés avec succès')
  @Delete('bulk')
  removeMany(@Body() dto: BulkDeleteDto) {
    return this.invoicesService.removeMany(dto.ids);
  }

  @ApiOperation({ summary: 'Supprimer un document' })
  @ResponseMessage('Document supprimé avec succès')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.invoicesService.remove(+id);
  }
}
