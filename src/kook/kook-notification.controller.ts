import {
  Controller, Get, Post, Patch, Param, UseGuards, Delete,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { KookAuthGuard } from './kook-auth.guard';
import { KookNotificationService } from './kook-notification.service';
import { KookUser } from './kook-user.decorator';

@Public()
@UseGuards(KookAuthGuard)
@Controller('kook/notifications')
export class KookNotificationController {
  constructor(private readonly notifs: KookNotificationService) {}

  @Get()
  async list(@KookUser() user: any) {
    return this.notifs.findByUser(user.id);
  }

  @Get('unread-count')
  async unreadCount(@KookUser() user: any) {
    const count = await this.notifs.getUnreadCount(user.id);
    return { count };
  }

  @Patch(':id/read')
  async markRead(@KookUser() user: any, @Param('id') id: string) {
    return this.notifs.markAsRead(+id, user.id);
  }

  @Post('read-all')
  async markAllRead(@KookUser() user: any) {
    return this.notifs.markAllAsRead(user.id);
  }

  @Delete(':id')
  async delete(@KookUser() user: any, @Param('id') id: string) {
    await this.notifs.markAsRead(+id, user.id);
    return { message: 'Notification supprimée' };
  }
}
