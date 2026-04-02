import { Controller, Post, Get, Param, UseInterceptors, UploadedFile, Res, BadRequestException, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TelegramService } from './telegram.service';
import { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Public()
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File, @Body('name') customName?: string) {
    if (!file) {
      throw new BadRequestException('Aucun fichier reçu (clé fom-data: "file")');
    }
    
    // Expo FileSystem assigne souvent un UUID à originalname. On privilégie le champ 'name' fourni par le client.
    const finalName = customName || file.originalname;

    console.log(`Requête d'upload pour le fichier : ${finalName}`);
    const messageId = await this.telegramService.uploadFile(file.buffer, finalName);
    
    return { 
      success: true, 
      messageId: messageId,
      fileName: finalName,
      size: file.size
    };
  }

  @Public()
  @Get('list')
  async getCatalog() {
    const files = await this.telegramService.getCatalog();
    return {
      success: true,
      files: files
    };
  }

  @Public()
  @Get('download/:id')
  async downloadFile(@Param('id') id: string, @Res() res: Response) {
    const messageId = parseInt(id, 10);
    if (isNaN(messageId)) {
      throw new BadRequestException('L\\\'ID du message fourni est invalide');
    }

    console.log(`Requête de download pour le message ID : ${messageId}`);
    try {
      const { buffer, fileName } = await this.telegramService.downloadFile(messageId);
      
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', buffer.length.toString());
      res.send(buffer);
    } catch (e) {
      console.error('Erreur au payload download:', e);
      throw new BadRequestException(e.message);
    }
  }
}
