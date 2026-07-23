import {
  Controller, Post, UploadedFile, UseGuards, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { KookAuthGuard } from './kook-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { KookTelegramService } from './services/kook-telegram.service';
import { KookNsfwService } from './services/kook-nsfw.service';

@Controller('kook/upload')
export class KookUploadController {
  constructor(
    private readonly telegram: KookTelegramService,
    private readonly nsfw: KookNsfwService,
  ) {}

  @Public()
  @UseGuards(KookAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 600000 } })
  @Post('image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(@UploadedFile() file: any) {
    if (!file) throw new BadRequestException('Aucun fichier fourni');

    await this.nsfw.assertSafe(file.buffer);
    const url = await this.telegram.uploadImage(file.buffer, file.originalname);

    return { url, message: 'Image uploadée avec succès' };
  }
}
