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
  private readonly chatId: string;
  private readonly apiBase: string;

  constructor(private readonly config: ConfigService) {
    this.botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN') || '';
    this.chatId = this.config.get<string>('TELEGRAM_CHAT_ID') || '';
    this.apiBase = `https://api.telegram.org/bot${this.botToken}`;
  }

  async uploadImage(buffer: Buffer, filename: string): Promise<string> {
    if (!this.botToken || !this.chatId) {
      this.logger.warn('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured, using placeholder');
      return `https://picsum.photos/seed/${filename}/400/300`;
    }

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
      return `https://picsum.photos/seed/${filename}/400/300`;
    }
  }

  private async getFilePath(fileId: string): Promise<string> {
    const response = await fetch(`${this.apiBase}/getFile?file_id=${fileId}`);
    const data = await response.json();
    if (!data.ok || !data.result) throw new Error('Impossible de récupérer le chemin du fichier');
    return data.result.file_path;
  }
}
