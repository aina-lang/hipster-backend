import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { CustomFile } from 'telegram/client/uploads';
import * as sharp from 'sharp';

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

  async uploadFile(buffer: Buffer, fileName: string, category?: string): Promise<{ messageId: number; thumbnailMessageId?: number }> {
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

    // Génération et envoi du thumbnail
    let thumbnailMessageId: number | undefined;
    try {
      const thumbBuffer = await this.generateThumbnail(buffer, fileName);
      if (thumbBuffer) {
        thumbnailMessageId = await this.sendThumbnail(msgId, thumbBuffer, {
          category: category || 'Autre',
          fileName: fileName,
          size: buffer.length
        });
      }
    } catch (e) {
      this.logger.warn(`Erreur lors de la génération/envoi du thumbnail pour ${fileName}: ${e.message}`);
    }

    return { messageId: msgId, thumbnailMessageId };
  }

  private async generateThumbnail(buffer: Buffer, fileName: string): Promise<Buffer | null> {
    const ext = fileName.split('.').pop()?.toLowerCase();
    
    // Images natives (PNG, JPG, JPEG, WEBP) — on génère une vraie miniature
    if (ext && ['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext)) {
      try {
        return sharp(buffer)
          .resize(300, 450, { fit: 'cover', position: 'top' })
          .png()
          .toBuffer();
      } catch (e) {
        this.logger.warn(`Échec redimensionnement image ${fileName}: ${e.message}`);
      }
    }

    // Rendu réel pour les PDF avec pdfjs-dist + Puppeteer
    if (ext === 'pdf') {
      try {
        this.logger.log(`Génération du thumbnail PDF via pdfjs-dist + Puppeteer pour ${fileName}...`);
        const puppeteer = require('puppeteer');
        const fs = require('fs');
        const path = require('path');
        
        const browser = await puppeteer.launch({ 
          headless: true, 
          args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();
        
        // HTML minimal pour rendu canvas via CDN (plus robuste que les chemins locaux)
        const html = `
          <html>
            <body style="margin:0; padding:0; background:white;">
              <canvas id="pdf-canvas"></canvas>
              <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
              <script>
                // IMPORTANT: Configurer le worker CDN
                const pdfjsLib = window['pdfjs-dist/build/pdf'];
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

                async function renderPdf(base64) {
                  try {
                    const binary = atob(base64);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                    
                    const loadingTask = pdfjsLib.getDocument({ data: bytes });
                    const pdf = await loadingTask.promise;
                    const page = await pdf.getPage(1);
                    const viewport = page.getViewport({ scale: 2.0 });
                    const canvas = document.getElementById('pdf-canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    await page.render({ canvasContext: context, viewport }).promise;
                    document.title = "RENDERED";
                  } catch (e) {
                    console.error(e);
                    document.title = "ERROR: " + e.message;
                  }
                }
              </script>
            </body>
          </html>
        `;

        await page.setContent(html);
        const base64Pdf = buffer.toString('base64');
        await page.evaluate((b64) => (window as any).renderPdf(b64), base64Pdf);

        // Attendre que le titre change (signal de fin de rendu)
        await page.waitForFunction('document.title === "RENDERED" || document.title.startsWith("ERROR")', { timeout: 15000 });
        
        const title = await page.title();
        if (title.startsWith("ERROR")) throw new Error(title);

        const canvasElement = await page.$('#pdf-canvas');
        if (!canvasElement) throw new Error('Canvas non trouvé');
        
        const thumb = await canvasElement.screenshot({ type: 'png' });
        await browser.close();
        
        // Redimensionner avec Sharp
        return sharp(thumb)
          .resize(300, 450, { fit: 'cover', position: 'top' })
          .png()
          .toBuffer();
      } catch (e) {
        this.logger.warn(`Échec rendu pdfjs-dist pour ${fileName}: ${e.message}. Fallback au placeholder.`);
      }
    }

    // Placeholder élégant pour les autres formats (Office, EPUB) ou en cas d'échec PDF/Image
    const width = 300;
    const height = 450;
    
    let bgColor = '#8E8E93'; // Gris par défaut
    if (ext === 'pdf') bgColor = '#FF453A';
    else if (ext === 'epub') bgColor = '#BF5AF2';
    else if (ext?.includes('doc')) bgColor = '#2b579a';
    else if (ext?.includes('ppt')) bgColor = '#d24726';
    else if (ext?.includes('xls')) bgColor = '#217346';

    const svg = `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect width="100%" height="100%" fill="${bgColor}" />
        <text x="50%" y="45%" text-anchor="middle" fill="white" font-family="Arial" font-size="80" font-weight="bold">${ext?.toUpperCase() || '?'}</text>
        <text x="50%" y="65%" text-anchor="middle" fill="white" font-family="Arial" font-size="20" opacity="0.8">BookMesh</text>
      </svg>
    `;

    return sharp(Buffer.from(svg))
      .png()
      .toBuffer();
  }

  private async sendThumbnail(fileMessageId: number, thumbBuffer: Buffer, metadata: any = {}): Promise<number> {
    const customFile = new CustomFile(`thumb_${fileMessageId}.png`, thumbBuffer.length, '', thumbBuffer);
    
    const payload = {
      thumb_for: fileMessageId,
      ...metadata,
      date_thumb: Math.floor(Date.now() / 1000)
    };

    const result: any = await this.client.sendFile(this.CHAT_ID, {
      file: customFile,
      caption: JSON.stringify(payload),
      forceDocument: false, // Envoyer comme photo
    });

    let msgId = result.id;
    if (!msgId && result.updates) {
      const update = result.updates.find((u: any) => u.message && (u.message.id || u.id));
      msgId = update?.message?.id || update?.id;
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
          
          // Recherche du thumbnail associé dans les messages récupérés (support JSON et legacy)
          const thumbnailMsg = messages.find(m => {
            if (!m.message) return false;
            if (m.message === `thumb_for:${msg.id}`) return true;
            try {
              const data = JSON.parse(m.message);
              return data.thumb_for === msg.id;
            } catch {
              return false;
            }
          });

          return {
            id: msg.id,
            fileName: fileName,
            fileSize: typeof doc.size === 'object' && doc.size.toNumber ? doc.size.toNumber() : Number(doc.size),
            date: msg.date,
            caption: msg.message,
            thumbnailMessageId: thumbnailMsg ? thumbnailMsg.id : undefined,
          };
        });

      this.logger.log(`[getCatalog] Terminé. ${files.length} fichiers trouvés.`);
      return files;
    } catch (error) {
      this.logger.error(`[getCatalog] Erreur fatale: ${error.message}`, error.stack);
      throw error;
    }
  }

  async downloadFile(messageId: number): Promise<{ buffer: Buffer, fileName: string }> {
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

    const doc = (message.media as any).document;
    const fileNameAttr = doc?.attributes?.find((attr: any) => 'fileName' in attr);
    const fileName = fileNameAttr ? (fileNameAttr as any).fileName : (message.message || `document_${messageId}.bin`);
 
    return { buffer: buffer as Buffer, fileName };
  }
}
