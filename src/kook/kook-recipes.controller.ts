import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { KookAuthGuard } from './kook-auth.guard';
import { KookUser } from './kook-user.decorator';
import { KookRecipesService } from './kook-recipes.service';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { UpdateRecipeDto } from './dto/update-recipe.dto';

@Controller('kook/recipes')
export class KookRecipesController {
  constructor(private readonly recipes: KookRecipesService) {}

  @UseGuards(KookAuthGuard)
  @Post()
  async create(@KookUser() user: any, @Body() dto: CreateRecipeDto) {
    return this.recipes.create(user, dto);
  }

  @Get()
  async list(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('difficulty') difficulty?: string,
  ) {
    return this.recipes.findAll({ page, limit, search, difficulty });
  }

  @Get('my')
  @UseGuards(KookAuthGuard)
  async myRecipes(@KookUser() user: any) {
    return this.recipes.getMyRecipes(user.id);
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.recipes.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(KookAuthGuard)
  async update(@Param('id') id: string, @KookUser() user: any, @Body() dto: UpdateRecipeDto) {
    return this.recipes.update(+id, user.id, dto);
  }

  @Delete(':id')
  @UseGuards(KookAuthGuard)
  async delete(@Param('id') id: string, @KookUser() user: any) {
    return this.recipes.delete(+id, user.id);
  }

  @Post(':id/like')
  @UseGuards(KookAuthGuard)
  async like(@Param('id') id: string) {
    return this.recipes.like(+id);
  }

  @Post(':id/unlike')
  @UseGuards(KookAuthGuard)
  async unlike(@Param('id') id: string) {
    return this.recipes.unlike(+id);
  }
}
