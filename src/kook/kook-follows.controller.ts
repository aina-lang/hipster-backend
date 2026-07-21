import { Controller, Get, Post, Delete, Param, UseGuards, Body } from '@nestjs/common';
import { KookAuthGuard } from './kook-auth.guard';
import { KookFollowsService } from './kook-follows.service';
import { KookUser } from './kook-user.decorator';

@Controller('kook/follows')
export class KookFollowsController {
  constructor(private readonly service: KookFollowsService) {}

  @UseGuards(KookAuthGuard)
  @Get('followers')
  async followers(@KookUser() user: any) {
    return this.service.findFollowers(user.id);
  }

  @UseGuards(KookAuthGuard)
  @Get('following')
  async following(@KookUser() user: any) {
    return this.service.findFollowing(user.id);
  }

  @UseGuards(KookAuthGuard)
  @Post(':userId')
  async follow(@KookUser() user: any, @Param('userId') userId: string) {
    return this.service.follow(user.id, +userId);
  }

  @UseGuards(KookAuthGuard)
  @Delete(':userId')
  async unfollow(@KookUser() user: any, @Param('userId') userId: string) {
    return this.service.unfollow(user.id, +userId);
  }
}
