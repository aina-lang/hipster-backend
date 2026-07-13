import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ChatsService } from './chats.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { BulkDeleteDto } from 'src/common/dto/bulk-delete.dto';

@ApiTags('Chats')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('chats')
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @ApiOperation({ summary: 'Créer une nouvelle conversation' })
  @ResponseMessage('Conversation créée avec succès')
  @Post()
  create(@Body() dto: CreateChatDto) {
    return this.chatsService.createRoom(dto);
  }

  @ApiOperation({ summary: 'Lister les conversations de l\'utilisateur connecté' })
  @Get('mine')
  findMine(@Request() req) {
    const userId = req.user.id || req.user.sub;
    return this.chatsService.findUserRooms(userId);
  }

  @ApiOperation({ summary: 'Toutes les conversations (admin/employee)' })
  @Get('all')
  findAll() {
    return this.chatsService.findAll();
  }

  @ApiOperation({ summary: 'Récupérer la room d\'un client (par clientProfileId)' })
  @Get('by-client/:clientProfileId')
  findRoomByClient(@Param('clientProfileId') clientProfileId: string) {
    return this.chatsService.findRoomByClient(+clientProfileId);
  }

  @ApiOperation({ summary: 'Récupérer une conversation par ID' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.chatsService.findOne(+id);
  }

  @ApiOperation({ summary: 'Messages d\'une conversation (paginated)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @Get(':id/messages')
  getMessages(
    @Param('id') id: string,
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const userId = req.user.id || req.user.sub;
    const roles = req.user.roles || [];
    return this.chatsService.getMessages(+id, userId, roles, +page || 1, +limit || 50);
  }

  @ApiOperation({ summary: 'Envoyer un message dans une conversation' })
  @ResponseMessage('Message envoyé avec succès')
  @Post(':id/messages')
  sendMessage(
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
    @Request() req,
  ) {
    const userId = req.user.id || req.user.sub;
    return this.chatsService.sendMessage(+id, userId, dto, req.user.roles);
  }

  @ApiOperation({ summary: 'Supprimer une conversation' })
  @ResponseMessage('Conversation supprimée avec succès')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.chatsService.removeRoom(+id);
  }

  @ApiOperation({ summary: 'Supprimer plusieurs conversations' })
  @ResponseMessage('Conversations supprimées avec succès')
  @Delete('bulk')
  removeMany(@Body() dto: BulkDeleteDto) {
    return this.chatsService.removeManyRooms(dto.ids);
  }
}