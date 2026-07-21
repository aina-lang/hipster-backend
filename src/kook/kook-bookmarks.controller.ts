import { Controller, Get, Post, Delete, Param, UseGuards, Body } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { KookAuthGuard } from './kook-auth.guard';
import { KookBookmarksService } from './kook-bookmarks.service';
import { KookUser } from './kook-user.decorator';

@Controller('kook/bookmarks')
export class KookBookmarksController {
  constructor(private readonly service: KookBookmarksService) {}

  @Public()
  @UseGuards(KookAuthGuard)
  @Get()
  async list(@KookUser() user: any) {
    return this.service.findUserBookmarks(user.id);
  }

  @Public()
  @UseGuards(KookAuthGuard)
  @Post(':recipeId')
  async toggle(@KookUser() user: any, @Param('recipeId') recipeId: string) {
    return this.service.toggle(user.id, +recipeId);
  }

  @Public()
  @UseGuards(KookAuthGuard)
  @Get('check/:recipeId')
  async check(@KookUser() user: any, @Param('recipeId') recipeId: string) {
    return { bookmarked: await this.service.isBookmarked(user.id, +recipeId) };
  }
}
