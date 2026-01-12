import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiUser } from './entities/ai-user.entity';
import { AiGeneration, AiGenerationType } from './entities/ai-generation.entity';

import OpenAI from 'openai';
import { encode, decode } from '@toon-format/toon';
import * as PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(AiUser)
    private readonly aiUserRepo: Repository<AiUser>,
    @InjectRepository(AiGeneration)
    private readonly aiGenRepo: Repository<AiGeneration>,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    
    this.openai = new OpenAI({
      apiKey: apiKey,
    });
    this.logger.log('--- AiService Loaded ---');
  }

  async getAiUserWithProfile(id: number) {
    return this.aiUserRepo.findOne({
      where: { id },
      relations: ['aiProfile'],
    });
  }

  async getHistory(userId: number) {
    return this.aiGenRepo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async chat(messages: any[], userId?: number): Promise<string> {
    console.log('--- START AI CHAT REQUEST ---');
    console.log('Messages:', JSON.stringify(messages, null, 2));
    
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: messages,
      });
      
      const content = completion.choices[0].message.content || '';
      console.log('--- AI RESPONSE RECEIVED ---');

      // PERSIST IF USER ID PROVIDED
      if (userId) {
        const lastUserMsg = messages.filter(m => m.role === 'user').pop();
        await this.aiGenRepo.save({
          user: { id: userId } as AiUser,
          type: AiGenerationType.CHAT,
          prompt: lastUserMsg?.content || 'Chat session',
          result: content,
          title: lastUserMsg?.content?.substring(0, 30) + '...',
        });
      }

      return content;
      
    } catch (error) {
      console.error('--- OPENAI ERROR ---');
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Erreur AI: ${errorMessage}`);
    }
  }

  async generateText(
    prompt: string,
    type: string,
    userId?: number,
  ): Promise<string> {
    let userName = 'l\'utilisateur';
    if (userId) {
      const userObj = await this.aiUserRepo.findOne({ where: { id: userId } });
      if (userObj?.firstName) {
        userName = userObj.firstName;
      }
    }

    const systemToon = encode({
      identity: 'Hipster IA',
      role: 'Expert assistant créatif',
      target: userName,
      context: `Génération de contenu ${type}`
    });

    const messages = [
      { role: 'system', content: `Tu es Hipster IA. Voici ta configuration en format TOON:\n${systemToon}` },
      { role: 'user', content: prompt }
    ];
    
    const result = await this.chat(messages);

    if (userId) {
      await this.aiGenRepo.save({
        user: { id: userId } as AiUser,
        type: AiGenerationType.TEXT,
        prompt: prompt,
        result: result,
        title: prompt.substring(0, 30) + '...',
      });
    }

    return result;
  }

  async generateImage(
    prompt: string,
    style: 'realistic' | 'cartoon' | 'sketch',
    userId?: number,
  ): Promise<string> {
    // Mock implementation
    const url = `https://via.placeholder.com/1024x1024.png?text=${encodeURIComponent(prompt)}+(${style})`;

    if (userId) {
      await this.aiGenRepo.save({
        user: { id: userId } as AiUser,
        type: AiGenerationType.IMAGE,
        prompt: prompt,
        result: 'Image generated',
        imageUrl: url,
        title: prompt.substring(0, 30) + '...',
      });
    }

    return url;
  }

  async generateDocument(
    type: 'legal' | 'business',
    params: any,
    userId?: number,
  ): Promise<{ content: string; generationId?: number }> {
    const { format: requestedFormat, function: funcName, ...restParams } = params;
    
    // Clean format hints from function name (e.g., "(PDF / DOCX)")
    const cleanFunctionName = funcName ? funcName.replace(/\s*\(.*?\)\s*/g, '').trim() : funcName;
    
    const toonParams = encode({
      ...restParams,
      function: cleanFunctionName,
    });

    const prompt = `Génère un document ${type} avec les paramètres suivants (format TOON) :\n${toonParams}\n\nIMPORTANT: Ta réponse doit être structurée pour que je puisse en extraire les sections. Utilise le format TOON suivant :\ntoon{\n  title: "Titre du document",\n  sections: [\n    { title: "Titre section 1", text: "Contenu rédigé..." },\n    { title: "Titre section 2", text: "Contenu rédigé..." }\n  ]\n}\n\nATTENTION : Le champ "text" doit contenir du texte rédigé, lisible et professionnel (pas de JSON, pas de markdown complexe). Fais des paragraphes clairs.`;
    const result = await this.generateText(prompt, 'business', userId);

    let generationId: number | undefined;

    if (userId) {
      try {
        // We just save the text result. The file is generated on demand.
        const latestGen = await this.aiGenRepo.findOne({
          where: { user: { id: userId }, type: AiGenerationType.TEXT },
          order: { createdAt: 'DESC' },
        });

        if (latestGen) {
          latestGen.type = AiGenerationType.DOCUMENT;
          const savedGen = await this.aiGenRepo.save(latestGen);
          generationId = savedGen.id;
        }
      } catch (error) {
        this.logger.error('Error updating generation record:', error);
      }
    }

    return { content: result, generationId };
  }

  async exportDocument(id: number, format: string, userId: number): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const generation = await this.aiGenRepo.findOne({
      where: { id, user: { id: userId } }
    });

    if (!generation) {
      throw new Error('Document non trouvé');
    }

    const contentData = this.parseDocumentContent(generation.result);
    const fileName = `document_${id}.${format}`;
    let buffer: Buffer;
    let mimeType: string;

    switch (format.toLowerCase()) {
      case 'pdf':
        buffer = await this.generatePdfBuffer(contentData);
        mimeType = 'application/pdf';
        break;
      case 'docx':
        buffer = await this.generateDocxBuffer(contentData);
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      case 'xlsx':
      case 'excel':
        buffer = await this.generateExcelBuffer(contentData);
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;
      default:
        throw new Error('Format non supporté');
    }

    return { buffer, fileName, mimeType };
  }

  private parseDocumentContent(text: string): any {
    console.log('--- Parsing Document Content ---');
    // Try to decode TOON first
    const toonBlocks = this.extractToonBlocks(text);
    console.log(`Found ${toonBlocks.length} TOON blocks`);
    
    if (toonBlocks.length > 0) {
      try {
        const decoded = decode(toonBlocks[0]);
        console.log('TOON Decoding Successful:', JSON.stringify(decoded, null, 2));
        return decoded;
      } catch (e) {
        this.logger.warn('Failed to decode TOON block in document content', e);
        console.error('TOON Decode Error:', e);
      }
    } else {
      console.log('No TOON blocks found, regex failed?');
    }
    
    // Fallback: simple split or return as is
    console.log('Fallback to raw text wrapping');
    return { title: 'Document Généré', sections: [{ title: 'Contenu', text }] };
  }

  private extractToonBlocks(text: string): string[] {
    const regex = /toon\{[\s\S]*?\}/g;
    return text.match(regex) || [];
  }

  private async generatePdfBuffer(data: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument();
      const chunks: any[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).text(data.title || 'Document', { align: 'center' });
      doc.moveDown();

      if (data.sections && Array.isArray(data.sections)) {
        data.sections.forEach((section: any) => {
          doc.fontSize(14).text(section.title || '', { underline: true });
          doc.fontSize(12).text(section.text || '');
          doc.moveDown();
        });
      } else if (typeof data === 'string') {
        doc.fontSize(12).text(data);
      } else {
        doc.fontSize(12).text(JSON.stringify(data, null, 2));
      }

      doc.end();
    });
  }

  private async generateDocxBuffer(data: any): Promise<Buffer> {
    const children = [
      new Paragraph({
        children: [new TextRun({ text: data.title || 'Document', bold: true, size: 32 })],
      }),
    ];

    if (data.sections && Array.isArray(data.sections)) {
      data.sections.forEach((section: any) => {
        children.push(new Paragraph({ text: '' }));
        children.push(
          new Paragraph({
            children: [new TextRun({ text: section.title || '', bold: true, size: 28 })],
          }),
        );
        children.push(new Paragraph({ text: section.text || '' }));
      });
    } else {
      children.push(new Paragraph({ text: JSON.stringify(data, null, 2) }));
    }

    const doc = new Document({ sections: [{ children }] });
    return await Packer.toBuffer(doc) as Buffer;
  }

  private async generateExcelBuffer(data: any): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Document');

    sheet.columns = [
      { header: 'Section', key: 'section', width: 30 },
      { header: 'Contenu', key: 'content', width: 70 },
    ];

    if (data.sections && Array.isArray(data.sections)) {
      data.sections.forEach((section: any) => {
        sheet.addRow({ section: section.title, content: section.text });
      });
    } else {
      sheet.addRow({ section: 'Contenu', content: JSON.stringify(data) });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async applyWatermark(imageUrl: string, isPremium: boolean): Promise<string> {
    if (isPremium) {
      return imageUrl; // No watermark for premium
    }
    // Mock watermark logic
    return `${imageUrl}&watermark=hipster_studio`;
  }
}
