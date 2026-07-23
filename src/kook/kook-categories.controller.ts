import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { KookAuthGuard } from './kook-auth.guard';
import { KookCategoriesService } from './kook-categories.service';
import { KookUser } from './kook-user.decorator';

@SkipThrottle()
@Controller('kook/categories')
export class KookCategoriesController {
  constructor(private readonly service: KookCategoriesService) {}

  @Public()
  @Get()
  async list() {
    return this.service.findAll();
  }

  @Public()
  @Get(':id')
  async get(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @UseGuards(KookAuthGuard)
  @Post()
  async create(@KookUser() user: any, @Body() dto: { name: string; slug?: string; description?: string }) {
    return this.service.create(dto);
  }

  @UseGuards(KookAuthGuard)
  @Patch(':id')
  async update(@KookUser() user: any, @Param('id') id: string, @Body() dto: { name?: string; slug?: string; description?: string }) {
    return this.service.update(+id, dto);
  }

  @UseGuards(KookAuthGuard)
  @Delete(':id')
  async remove(@KookUser() user: any, @Param('id') id: string) {
    return this.service.remove(+id);
  }
}
