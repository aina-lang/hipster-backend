import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { ClientWebsitesService } from './client-websites.service';
import { CreateClientWebsiteDto } from './dto/create-client-website.dto';
import { UpdateClientWebsiteDto } from './dto/update-client-website.dto';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { BulkDeleteDto } from 'src/common/dto/bulk-delete.dto';
import { User } from 'src/common/decorators/user.decorator';
import { isMaintenancePricingAdmin } from 'src/common/utils/roles.utils';
import {
  stripWebsitePricing,
  stripWebsitePricingFromAll,
} from 'src/common/utils/website-pricing.utils';

@Controller('profiles/clients/:clientId/websites')
export class ClientWebsitesController {
  constructor(private readonly websitesService: ClientWebsitesService) {}

  @Post()
  create(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Body() createDto: CreateClientWebsiteDto,
  ) {
    return this.websitesService.create(clientId, createDto);
  }

  @Get()
  async findAll(
    @Param('clientId', ParseIntPipe) clientId: number,
    @User() user: any,
  ) {
    const websites = await this.websitesService.findAllByClient(clientId);
    if (!isMaintenancePricingAdmin(user)) stripWebsitePricingFromAll(websites);
    return websites;
  }

  @Get(':id')
  async findOne(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Param('id', ParseIntPipe) id: number,
    @User() user: any,
  ) {
    const website = await this.websitesService.findOne(id, clientId);
    return isMaintenancePricingAdmin(user) ? website : stripWebsitePricing(website);
  }

  @Patch(':id')
  async update(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateClientWebsiteDto,
    @User() user: any,
  ) {
    // Les tarifs ne transitent pas par ce DTO (voir PATCH /maintenance/websites/:id/pricing),
    // mais la réponse renvoie l'entité complète : on la nettoie aussi.
    const website = await this.websitesService.update(id, clientId, updateDto);
    return isMaintenancePricingAdmin(user) ? website : stripWebsitePricing(website);
  }

  @ResponseMessage('Websites supprimés avec succès')
  @Delete('bulk')
  removeMany(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Body() dto: BulkDeleteDto,
  ) {
    return this.websitesService.removeMany(clientId, dto.ids);
  }

  @Delete(':id')
  remove(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.websitesService.remove(id, clientId);
  }
}
