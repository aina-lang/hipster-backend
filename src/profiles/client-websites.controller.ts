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
  findAll(@Param('clientId', ParseIntPipe) clientId: number) {
    return this.websitesService.findAllByClient(clientId);
  }

  @Get(':id')
  findOne(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.websitesService.findOne(id, clientId);
  }

  @Patch(':id')
  update(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateClientWebsiteDto,
  ) {
    return this.websitesService.update(id, clientId, updateDto);
  }

  @Delete(':id')
  remove(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.websitesService.remove(id, clientId);
  }
}
