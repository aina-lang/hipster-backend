import {
  Body, Controller, Delete, Get, Param, Post, UseGuards,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { KookAuthGuard } from './kook-auth.guard';
import { KookCommentService } from './kook-comment.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { KookUser } from './kook-user.decorator';

@Controller('kook/recipes/:recipeId/comments')
export class KookCommentController {
  constructor(private readonly comments: KookCommentService) {}

  @Public()
  @Get()
  async list(@Param('recipeId') recipeId: string) {
    return this.comments.findByRecipe(+recipeId);
  }

  @Public()
  @UseGuards(KookAuthGuard)
  @Post()
  async create(@KookUser() user: any, @Param('recipeId') recipeId: string, @Body() dto: CreateCommentDto) {
    return this.comments.create(user, +recipeId, dto);
  }

  @Public()
  @UseGuards(KookAuthGuard)
  @Delete(':commentId')
  async delete(@KookUser() user: any, @Param('recipeId') recipeId: string, @Param('commentId') commentId: string) {
    return this.comments.delete(+commentId, +recipeId, user.id);
  }

  @Public()
  @UseGuards(KookAuthGuard)
  @Get('likes')
  async getUserLikes(@KookUser() user: any, @Param('recipeId') recipeId: string) {
    return this.comments.getUserLikes(+recipeId, user.id);
  }

  @Public()
  @UseGuards(KookAuthGuard)
  @Post(':commentId/like')
  async like(@KookUser() user: any, @Param('commentId') commentId: string) {
    return this.comments.like(+commentId, user.id);
  }

  @Public()
  @UseGuards(KookAuthGuard)
  @Post(':commentId/unlike')
  async unlike(@KookUser() user: any, @Param('commentId') commentId: string) {
    return this.comments.unlike(+commentId, user.id);
  }
}
