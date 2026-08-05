import {
  Controller, Get, Post, Patch, Param, Query, UseGuards, Delete,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { KookAuthGuard } from './kook-auth.guard';
import { KookNotificationService } from './kook-notification.service';
import { KookUser } from './kook-user.decorator';

@Public()
@UseGuards(KookAuthGuard)
@SkipThrottle()
@Controller('kook/notifications')
export class KookNotificationController {
  constructor(private readonly notifs: KookNotificationService) {}

  @Get()
  async list(@KookUser() user: any, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.notifs.findByUser(user.id, page ? +page : 1, limit ? +limit : 20);
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

  @Delete()
  async deleteAll(@KookUser() user: any) {
    return this.notifs.deleteAll(user.id);
  }

  @Delete(':id')
  async delete(@KookUser() user: any, @Param('id') id: string) {
    await this.notifs.delete(+id, user.id);
    return { message: 'Notification supprimée' };
  }
}
