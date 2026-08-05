import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface TelegramPhotoResponse {
  ok: boolean;
  result?: {
    photo: { file_id: string; file_unique_id: string; file_size: number; width: number; height: number }[];
    message_id: number;
  };
  description?: string;
}

@Injectable()
export class KookTelegramService {
  private readonly logger = new Logger(KookTelegramService.name);
  private readonly botToken: string;
  private readonly apiBase: string;
  private readonly chatId: string;

  constructor(configService: ConfigService) {
    this.botToken = configService.get('KOOK_TELEGRAM_BOT_TOKEN', '8900197244:AAFLfpN3FsDPrXLoGoWcSGesiZiDzMMTcj8');
    this.apiBase = `https://api.telegram.org/bot${this.botToken}`;
    this.chatId = configService.get('KOOK_TELEGRAM_CHAT_ID', '7503381814');
  }

  async uploadImage(buffer: Buffer, filename: string): Promise<string> {
    try {
      const formData = new FormData();
      const blob = new Blob([buffer as unknown as BlobPart], { type: 'image/jpeg' });
      formData.append('chat_id', this.chatId);
      formData.append('photo', blob, filename);

      const response = await fetch(`${this.apiBase}/sendPhoto`, {
        method: 'POST',
        body: formData,
      });

      const data: TelegramPhotoResponse = await response.json();

      if (!data.ok || !data.result) {
        throw new Error(data.description || 'Échec de l\'envoi vers Telegram');
      }

      const fileId = data.result.photo[data.result.photo.length - 1].file_id;
      const fileUrl = `https://api.telegram.org/file/bot${this.botToken}/${await this.getFilePath(fileId)}`;

      this.logger.debug(`Image uploaded to Telegram: ${fileUrl}`);
      return fileUrl;
    } catch (error) {
      this.logger.error(`Erreur upload Telegram: ${error.message}`);
      throw new Error(`Impossible d'uploader l'image: ${error.message}`);
    }
  }

  private async getFilePath(fileId: string): Promise<string> {
    const response = await fetch(`${this.apiBase}/getFile?file_id=${fileId}`);
    const data = await response.json();
    if (!data.ok || !data.result) throw new Error('Impossible de récupérer le chemin du fichier');
    return data.result.file_path;
  }
}
