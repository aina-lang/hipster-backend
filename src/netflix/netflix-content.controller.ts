import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { NetflixAuthGuard } from './netflix-auth.guard';
import { NetflixUser } from './netflix-user.decorator';
import { NetflixContentService } from './netflix-content.service';
import { CreateVideoDto } from './dto/create-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';
import { GenerateCodesDto } from './dto/generate-codes.dto';

@Controller('netflix/content')
export class NetflixContentController {
  constructor(private readonly content: NetflixContentService) {}

  @UseGuards(NetflixAuthGuard)
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads', 'netflix'),
        filename: (_req, file, cb) => {
          const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`;
          cb(null, name);
        },
      }),
      limits: { fileSize: 2 * 1024 * 1024 * 1024 },
    }),
  )
  async upload(
    @NetflixUser() user: any,
    @Body() dto: CreateVideoDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.content.createVideo(user, dto, file);
  }

  @Get()
  async list(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('type') type?: any,
    @Query('visibility') visibility?: any,
    @Query('seriesId') seriesId?: number,
  ) {
    return this.content.findAll({ page, limit, type, visibility, seriesId });
  }

  @Get('my')
  @UseGuards(NetflixAuthGuard)
  async myVideos(@NetflixUser() user: any) {
    return this.content.getMyVideos(user.id);
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @NetflixUser() user?: any) {
    return this.content.findOne(+id, user?.id);
  }

  @Get(':id/stream')
  async stream(@Param('id') id: string) {
    return this.content.getStreamUrl(+id);
  }

  @Patch(':id')
  @UseGuards(NetflixAuthGuard)
  async update(
    @Param('id') id: string,
    @NetflixUser() user: any,
    @Body() dto: UpdateVideoDto,
  ) {
    return this.content.updateVideo(+id, user.id, dto);
  }

  @Delete(':id')
  @UseGuards(NetflixAuthGuard)
  async delete(@Param('id') id: string, @NetflixUser() user: any) {
    return this.content.deleteVideo(+id, user.id);
  }

  @Post('codes')
  @UseGuards(NetflixAuthGuard)
  async generateCodes(@NetflixUser() user: any, @Body() dto: GenerateCodesDto) {
    return this.content.generateCodes(dto.videoId, dto.count, user.id);
  }

  @Get(':id/codes')
  @UseGuards(NetflixAuthGuard)
  async getCodes(@Param('id') id: string, @NetflixUser() user: any) {
    return this.content.getCodes(+id, user.id);
  }

  @Post('codes/verify')
  async verifyCode(@Body('code') code: string) {
    return this.content.verifyAccessCode(code);
  }

  @Delete('codes/:codeId')
  @UseGuards(NetflixAuthGuard)
  async deleteCode(@Param('codeId') codeId: string, @NetflixUser() user: any) {
    return this.content.deleteCode(+codeId, user.id);
  }
}
