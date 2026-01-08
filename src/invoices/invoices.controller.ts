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
} from '@nestjs/common';
import type { Response } from 'express';
import { User } from 'src/common/decorators/user.decorator';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPaginationQueries } from 'src/common/decorators/api-pagination-query.decorator';
import { InvoiceStatus, InvoiceType } from './entities/invoice.entity';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';

@ApiTags('Invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @ApiOperation({ summary: 'Créer une facture' })
  @ResponseMessage('Facture créée avec succès')
  @Post()
  create(@Body() createInvoiceDto: CreateInvoiceDto, @User() user: any) {
    return this.invoicesService.create(createInvoiceDto, user);
  }

  @ApiOperation({ summary: 'Lister les factures' })
  @ApiPaginationQueries([
    { name: 'status', required: false, enum: InvoiceStatus },
    { name: 'type', required: false, enum: InvoiceType },
    { name: 'clientId', required: false, type: Number },
    { name: 'projectId', required: false, type: Number },
  ])
  @Get()
  findAll(@Query() query: QueryInvoicesDto) {
    return this.invoicesService.findPaginated(query);
  }

  @ApiOperation({ summary: 'Récupérer une facture par ID' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(+id);
  }

  @ApiOperation({ summary: 'Générer le PDF de la facture' })
  @Get(':id/pdf')
  async generatePdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.invoicesService.generatePdf(+id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=invoice-${id}.pdf`,
      'Content-Length': buffer.length.toString(),
    });

    res.end(buffer);
  }

  @ApiOperation({ summary: 'Convertir un devis accepté en facture' })
  @ResponseMessage('Devis converti en facture avec succès')
  @Post(':id/convert-to-invoice')
  convertQuoteToInvoice(@Param('id') id: string, @User() user: any) {
    return this.invoicesService.convertQuoteToInvoice(+id, user);
  }

  @ApiOperation({ summary: 'Mettre à jour une facture' })
  @ResponseMessage('Facture mise à jour avec succès')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateInvoiceDto: UpdateInvoiceDto) {
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

  @ApiOperation({ summary: 'Supprimer une facture' })
  @ResponseMessage('Facture supprimée avec succès')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.invoicesService.remove(+id);
  }
}
