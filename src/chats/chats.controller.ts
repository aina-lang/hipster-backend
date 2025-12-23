import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ChatsService } from './chats.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';

@ApiTags('Chats')
@ApiBearerAuth()
@Controller('chats')
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @ApiOperation({ summary: 'Créer un message / chat' })
  @ResponseMessage('Message envoyé avec succès')
  @Post()
  create(@Body() createChatDto: CreateChatDto) {
    return this.chatsService.create(createChatDto);
  }

  @ApiOperation({ summary: 'Lister tous les chats' })
  @Get()
  findAll() {
    return this.chatsService.findAll();
  }

  @ApiOperation({ summary: 'Récupérer un chat par ID' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.chatsService.findOne(+id);
  }

  @ApiOperation({ summary: 'Mettre à jour un chat' })
  @ResponseMessage('Chat mis à jour avec succès')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateChatDto: UpdateChatDto) {
    return this.chatsService.update(+id, updateChatDto);
  }

  @ApiOperation({ summary: 'Supprimer un chat' })
  @ResponseMessage('Chat supprimé avec succès')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.chatsService.remove(+id);
  }
}
