import { Controller, Get, Post, Delete, Param, UseGuards, Body } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { KookAuthGuard } from './kook-auth.guard';
import { KookFollowsService } from './kook-follows.service';
import { KookUser } from './kook-user.decorator';

@SkipThrottle()
@Controller('kook/follows')
export class KookFollowsController {
  constructor(private readonly service: KookFollowsService) {}

  @Public()
  @UseGuards(KookAuthGuard)
  @Get('followers')
  async followers(@KookUser() user: any) {
    return this.service.findFollowers(user.id);
  }

  @Public()
  @UseGuards(KookAuthGuard)
  @Get('following')
  async following(@KookUser() user: any) {
    return this.service.findFollowing(user.id);
  }

  @Public()
  @UseGuards(KookAuthGuard)
  @Post(':userId')
  async follow(@KookUser() user: any, @Param('userId') userId: string) {
    return this.service.follow(user.id, +userId);
  }

  @Public()
  @UseGuards(KookAuthGuard)
  @Delete(':userId')
  async unfollow(@KookUser() user: any, @Param('userId') userId: string) {
    return this.service.unfollow(user.id, +userId);
  }
}
