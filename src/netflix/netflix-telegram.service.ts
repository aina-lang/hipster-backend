import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as FormData from 'form-data';
import axios from 'axios';

const TG_API = 'https://api.telegram.org';

@Injectable()
export class NetflixTelegramService {
  private readonly logger = new Logger(NetflixTelegramService.name);
  private readonly botToken: string;
  private readonly chatId: string;

  constructor(private readonly config: ConfigService) {
    this.botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN', '');
    this.chatId = this.config.get<string>('TELEGRAM_CHAT_ID', '');
  }

  private get api() {
    return `${TG_API}/bot${this.botToken}`;
  }

  async uploadVideo(filePath: string, fileName: string): Promise<{ fileId: string; filePath: string; fileSize: number }> {
    if (!this.botToken) {
      this.logger.warn('TELEGRAM_BOT_TOKEN non configuré, upload simulé');
      return {
        fileId: 'mock_file_id',
        filePath: 'mock_file_path',
        fileSize: 0,
      };
    }

    const form = new FormData();
    form.append('chat_id', this.chatId);
    form.append('video', fs.createReadStream(filePath), fileName);
    form.append('supports_streaming', 'true');

    const { data } = await axios.post(`${this.api}/sendVideo`, form, {
      headers: { ...form.getHeaders() },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const tgFileId = data.result.video.file_id;
    const tgFile = await this.getFileInfo(tgFileId);

    return {
      fileId: tgFileId,
      filePath: tgFile.file_path,
      fileSize: data.result.video.file_size || 0,
    };
  }

  async uploadThumbnail(filePath: string, fileName: string): Promise<string> {
    if (!this.botToken) return 'mock_thumb_id';

    const form = new FormData();
    form.append('chat_id', this.chatId);
    form.append('photo', fs.createReadStream(filePath), fileName);

    const { data } = await axios.post(`${this.api}/sendPhoto`, form, {
      headers: { ...form.getHeaders() },
    });

    const photos = data.result.photo;
    return photos[photos.length - 1].file_id;
  }

  async getFileInfo(fileId: string): Promise<{ file_path: string }> {
    const { data } = await axios.get(`${this.api}/getFile`, {
      params: { file_id: fileId },
    });
    return data.result;
  }

  getStreamUrl(filePath: string): string {
    return `${this.api}/${filePath}`;
  }
}
