import { Injectable, Logger } from '@nestjs/common';

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
  private readonly botToken = '8900197244:AAFLfpN3FsDPrXLoGoWcSGesiZiDzMMTcj8';
  private readonly apiBase = `https://api.telegram.org/bot${this.botToken}`;
  private chatId = '';

  async uploadImage(buffer: Buffer, filename: string): Promise<string> {
    if (!this.chatId) {
      this.chatId = await this.resolveChatId();
    }
    if (!this.chatId) {
      this.logger.warn('Impossible de résoudre le chat ID, using placeholder');
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

  private async resolveChatId(): Promise<string> {
    try {
      const res = await fetch(`${this.apiBase}/getUpdates`);
      const data = await res.json();
      if (data.ok && data.result?.length > 0) {
        const chat = data.result[0].message?.chat || data.result[0].my_chat_member?.chat;
        if (chat?.id) {
          this.logger.log(`Chat ID résolu automatiquement: ${chat.id} (${chat.type})`);
          return String(chat.id);
        }
      }
      this.logger.warn('Aucun chat trouvé via getUpdates');
      return '';
    } catch (e) {
      this.logger.error(`Erreur résolution chat ID: ${e.message}`);
      return '';
    }
  }

  private async getFilePath(fileId: string): Promise<string> {
    const response = await fetch(`${this.apiBase}/getFile?file_id=${fileId}`);
    const data = await response.json();
    if (!data.ok || !data.result) throw new Error('Impossible de récupérer le chemin du fichier');
    return data.result.file_path;
  }
}
