import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { CustomFile } from 'telegram/client/uploads';

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private client: TelegramClient;
  
  // Constantes API Telegram
  private readonly API_ID = 32864624;
  private readonly API_HASH = "7d8c05d23b32de6deee14ae008ed3b25";
  private readonly BOT_TOKEN = "8672989345:AAFVOgPq6zrlmyflb_M5sWjVYurVaxPRlUw";

  // L'ID du chat où les fichiers seront stockés. Les Bots ne peuvent pas s'envoyer des messages à eux-mêmes ("me").
  // Crée un canal privé sur Telegram, ajoute le bot en tant qu'admin, puis met l'ID du canal ici (ex: -100123456789)
  // Ou utilise ton propre Chat ID utilisateur (ex: 123456789) si tu as déjà démarré une conversation avec le bot.
  private readonly CHAT_ID = "-1003883098558";

  async onModuleInit() {
    this.logger.log('Initialisation du client Telegram (Bot)...');
    
    // StringSession vide par défaut car Bot Token Auth n'as pas de session String pérenne native
    const stringSession = new StringSession("");
    
    this.client = new TelegramClient(stringSession, this.API_ID, this.API_HASH, {
      connectionRetries: 5,
    });

    try {
      await this.client.start({
        botAuthToken: this.BOT_TOKEN,
      });
      this.logger.log('Telegram connecté avec succès en tant que Bot !');
    } catch (error) {
      this.logger.error('Erreur lors de la connexion à Telegram', error);
    }
  }

  async uploadFile(buffer: Buffer, fileName: string): Promise<number> {
    if (!this.client || !this.client.connected) {
      throw new Error('Client Telegram non connecté');
    }
    
    this.logger.log(`Uploading file ${fileName} (${buffer.length} octets) to Telegram...`);
    const customFile = new CustomFile(fileName, buffer.length, '', buffer);
    
    // Les bots doivent envoyer dans un Chat ID existant
    const result = await this.client.sendFile(this.CHAT_ID, {
      file: customFile,
      caption: `BookMesh Document: ${fileName}`,
      forceDocument: true,
    });

    return result.id;
  }

  async downloadFile(messageId: number): Promise<Buffer> {
    if (!this.client || !this.client.connected) {
      throw new Error('Client Telegram non connecté');
    }

    this.logger.log(`Downloading Telegram document with message ID: ${messageId}...`);
    const messages = await this.client.getMessages(this.CHAT_ID, { ids: [messageId] });
    const message = messages[0];

    if (!message || !message.media) {
      throw new Error('Document introuvable sur Telegram pour ce Message ID');
    }

    const buffer = await this.client.downloadMedia(message, {});

    if (!buffer) {
      throw new Error('Le buffer téléchargé est vide.');
    }

    return buffer as Buffer;
  }
}
