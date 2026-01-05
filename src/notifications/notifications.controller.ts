import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPaginationQueries } from 'src/common/decorators/api-pagination-query.decorator';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { User } from 'src/common/decorators/user.decorator';
import { Role } from 'src/common/enums/role.enum';
import { User as UserEntity } from 'src/users/entities/user.entity';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @ApiOperation({ summary: 'Créer une notification' })
  @ResponseMessage('Notification créée avec succès')
  @Post()
  create(@Body() createNotificationDto: CreateNotificationDto) {
    return this.notificationsService.create(createNotificationDto);
  }

  @ApiOperation({ summary: 'Lister les notifications' })
  @ApiPaginationQueries([
    { name: 'userId', required: false, type: Number },
    { name: 'isRead', required: false, type: Boolean },
  ])
  @Get()
  findAll(@Query() query: QueryNotificationsDto, @User() user: UserEntity) {
    // Si l'utilisateur n'est pas admin, il ne peut voir que ses propres notifications
    if (!user.roles.includes(Role.ADMIN)) {
      query.userId = user.id;
    }
    return this.notificationsService.findPaginated(query);
  }

  @ApiOperation({ summary: 'Récupérer une notification par ID' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.notificationsService.findOne(+id);
  }

  @ApiOperation({ summary: 'Marquer toutes les notifications comme lues' })
  @ResponseMessage('Toutes les notifications ont été marquées comme lues')
  @Patch('mark-all-read')
  markAllAsRead(@Body() body: { userId: number }, @User() user: UserEntity) {
    // Si l'utilisateur n'est pas admin, il ne peut marquer que ses propres notifications
    if (!user.roles.includes(Role.ADMIN)) {
      body.userId = user.id;
    }
    return this.notificationsService.markAllAsRead(body.userId);
  }

  @ApiOperation({ summary: 'Mettre à jour une notification' })
  @ResponseMessage('Notification mise à jour avec succès')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateNotificationDto: UpdateNotificationDto,
  ) {
    return this.notificationsService.update(+id, updateNotificationDto);
  }

  @ApiOperation({ summary: 'Supprimer une notification' })
  @ResponseMessage('Notification supprimée avec succès')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.notificationsService.remove(+id);
  }
}
