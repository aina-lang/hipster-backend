import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, Logger,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { KookAuthGuard } from './kook-auth.guard';
import { KookUser } from './kook-user.decorator';
import { KookRecipesService } from './kook-recipes.service';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { UpdateRecipeDto } from './dto/update-recipe.dto';

@Controller('kook/recipes')
export class KookRecipesController {
  private readonly logger = new Logger(KookRecipesController.name);

  constructor(private readonly recipes: KookRecipesService) {}

  @Public()
  @UseGuards(KookAuthGuard)
  @Post()
  async create(@KookUser() user: any, @Body() dto: CreateRecipeDto) {
    this.logger.log(`[create] user=${user?.id} ${user?.email} title="${dto?.title}"`);
    try {
      const result = await this.recipes.create(user, dto);
      this.logger.log(`[create] success id=${result.id}`);
      return result;
    } catch (e: any) {
      this.logger.error(`[create] error: ${e?.message}`, e?.stack);
      throw e;
    }
  }

  @Public()
  @Get()
  async list(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('difficulty') difficulty?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.recipes.findAll({ page, limit, search, difficulty, categoryId: categoryId ? +categoryId : undefined });
  }

  @Public()
  @Get('my')
  @UseGuards(KookAuthGuard)
  async myRecipes(@KookUser() user: any) {
    return this.recipes.getMyRecipes(user.id);
  }

  @Public()
  @UseGuards(KookAuthGuard)
  @Get('likes')
  async getUserLikes(@KookUser() user: any) {
    return this.recipes.getUserLikes(user.id);
  }

  @Public()
  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.recipes.findOne(+id);
  }

  @Public()
  @UseGuards(KookAuthGuard)
  @Patch(':id')
  async update(@Param('id') id: string, @KookUser() user: any, @Body() dto: UpdateRecipeDto) {
    return this.recipes.update(+id, user.id, dto);
  }

  @Public()
  @UseGuards(KookAuthGuard)
  @Delete(':id')
  async delete(@Param('id') id: string, @KookUser() user: any) {
    return this.recipes.delete(+id, user.id);
  }

  @Public()
  @UseGuards(KookAuthGuard)
  @Post('bulk-delete')
  async bulkDelete(@KookUser() user: any, @Body('ids') ids: number[]) {
    return this.recipes.bulkDelete(ids, user.id);
  }

  @Public()
  @UseGuards(KookAuthGuard)
  @Post(':id/like')
  async like(@Param('id') id: string, @KookUser() user: any) {
    return this.recipes.like(+id, user.id);
  }

  @Public()
  @UseGuards(KookAuthGuard)
  @Post(':id/unlike')
  async unlike(@Param('id') id: string, @KookUser() user: any) {
    return this.recipes.unlike(+id, user.id);
  }
}
