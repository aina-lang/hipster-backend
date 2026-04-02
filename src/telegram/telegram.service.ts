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
  private readonly STRING_SESSION = "1BAAOMTQ5LjE1NC4xNjcuOTEAUEci0fjVAGxcyB0ir4/YGED5I4/suKbY1a4J2JZuA1FCf1hEOiozMeuQ66qaw5+/g8OI3oMYa8kOO2XiYdMCoc9kDlQlGqUIgWjPuV8Ul94Ji5WAFlPvd4V28QPMXx0DHV74oJsWS+UVxVKjMPnaHU+uASgTnfB26B3CUm9sIF1LJYcDbX8f/PElEXDEVfxTZyteby/KKTaWmz6Ce/ydsY1Cznvh0Ta8EH/k+h0k4kXuvLIWUifr/ttBuPzVlB6HSf2snAwvplvCTyd9DjjjdcX73zuLjr8hrB6K1KHP92y5WL8nK9SuQeGUNXXCL4YdAxXIHg0E7vkcVIoJE87Gtf0=";

  // L'ID du chat où les fichiers seront stockés.
  // Crée un canal privé sur Telegram, ajoute le bot en tant qu'admin, puis met l'ID du canal ici (ex: -100123456789)
  // Ou utilise ton propre Chat ID utilisateur (ex: 123456789) si tu as déjà démarré une conversation avec le bot.
  private readonly CHAT_ID = "-1003883098558";

  async onModuleInit() {
    this.logger.log('Initialisation du client Telegram (User Session)...');
    
    // Utilisation de la StringSession générée pour agir en tant qu'utilisateur (permet le listage)
    const stringSession = new StringSession(this.STRING_SESSION);
    
    this.client = new TelegramClient(stringSession, this.API_ID, this.API_HASH, {
      connectionRetries: 5,
    });

    try {
      await this.client.start({} as any);
      this.logger.log('Telegram connecté avec succès via StringSession !');
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
    
    const result: any = await this.client.sendFile(this.CHAT_ID, {
      file: customFile,
      caption: `BookMesh Document: ${fileName}`,
      forceDocument: true,
    });

    // Envoi vers un channel peut renvoyer Api.Updates au lieu de Api.Message
    let msgId = result.id;
    if (!msgId && result.updates) {
      const update = result.updates.find((u: any) => u.message && u.message.id);
      if (update) {
        msgId = update.message.id;
      }
    }

    if (!msgId) {
      this.logger.error(`Impossible de récupérer l'ID du message. Resultat: ${Object.keys(result)}`);
      throw new Error("Erreur de récupération de l'ID Telegram");
    }

    return msgId;
  }

  async getCatalog(): Promise<any[]> {
    if (!this.client || !this.client.connected) {
      throw new Error('Client Telegram non connecté');
    }

    try {
      this.logger.log(`[getCatalog] Début du listing pour CHAT_ID: ${this.CHAT_ID}`);
      
      // On résout l'entité explicitement pour éviter les ambiguïtés
      const entity = await this.client.getEntity(this.CHAT_ID);
      this.logger.log(`[getCatalog] Entité résolue: ${entity.className} (ID: ${entity.id})`);

      this.logger.log('[getCatalog] Appel à getMessages(limit: 100)...');
      const messages = await this.client.getMessages(entity, { limit: 100 });
      this.logger.log(`[getCatalog] Récupéré ${messages.length} messages.`);
      
      const files = messages
        .filter(msg => msg.media && (msg.media as any).document)
        .map(msg => {
          const doc = (msg.media as any).document;
          const fileNameAttr = doc.attributes?.find((attr: any) => attr.fileName);
          const fileName = fileNameAttr ? fileNameAttr.fileName : (msg.message || 'document.pdf');
          
          return {
            id: msg.id,
            fileName: fileName,
            fileSize: typeof doc.size === 'object' && doc.size.toNumber ? doc.size.toNumber() : Number(doc.size),
            date: msg.date,
            caption: msg.message
          };
        });

      this.logger.log(`[getCatalog] Terminé. ${files.length} fichiers trouvés.`);
      return files;
    } catch (error) {
      this.logger.error(`[getCatalog] Erreur fatale: ${error.message}`, error.stack);
      throw error;
    }
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
