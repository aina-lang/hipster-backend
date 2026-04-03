import { Controller, Post, Get, Body, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TelegramService } from '../telegram/telegram.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('app-update')
export class AppUpdateController {
  constructor(private readonly telegramService: TelegramService) {}

  @Public()
  @Get('latest')
  async getLatestUpdate() {
    const latest = await this.telegramService.getLatestAppUpdate();
    return { success: true, data: latest };
  }

  @Public()
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadApk(
    @UploadedFile() file: Express.Multer.File,
    @Body('version') version: string,
    @Body('description') description: string
  ) {
    if (!file) throw new BadRequestException('Fichier APK/AAB requis');
    if (!version) throw new BadRequestException('Version requise');

    const fileName = file.originalname || `BookMesh-${version}.apk`;

    // Metadata stockée sous forme de JSON directement dans la caption du document Telegram
    const metadata = {
      type: 'app_update',
      version,
      description: description || 'Nouvelle version de BookMesh'
    };
    const explicitCaption = JSON.stringify(metadata);

    const { messageId } = await this.telegramService.uploadFile(
      file.buffer,
      fileName,
      undefined, // no category
      undefined, // no author
      undefined, // no description
      explicitCaption // THIS overwrites thumbnail logic and uses JSON directly on the doc
    );

    const updateInfo = {
      version,
      description: metadata.description,
      telegramMessageId: messageId,
      downloadUrl: `https://hipster-api.fr/api/telegram/download/${messageId}`
    };

    return { success: true, data: updateInfo };
  }
}
