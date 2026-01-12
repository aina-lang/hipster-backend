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
  ): Promise<{ content: string; fileUrl?: string }> {
    const toonParams = encode(params);
    const prompt = `Génère un document ${type} avec les paramètres suivants (format TOON) :\n${toonParams}\n\nIMPORTANT: Ta réponse doit être structurée pour que je puisse en extraire les sections (Titre, Sections avec contenu). Utilise un format TOON pour la structure du document.`;
    const result = await this.generateText(prompt, 'business', userId);

    let fileUrl: string | undefined;

    if (userId) {
      try {
        // Simple heuristic to determine format or default to PDF
        const format = params.format || 'pdf';
        const fileName = `${type}_${crypto.randomUUID()}.${format}`;
        const filePath = path.join('uploads', 'documents', fileName);
        
        // Extract structured data if possible, or use raw text
        const contentData = this.parseDocumentContent(result);

        if (format === 'pdf') {
          fileUrl = await this.generatePdf(contentData, filePath);
        } else if (format === 'docx') {
          fileUrl = await this.generateDocx(contentData, filePath);
        } else if (format === 'xlsx' || format === 'excel') {
          fileUrl = await this.generateExcel(contentData, filePath);
        }

        if (fileUrl) {
          // Update the last generation record with the fileUrl
          const latestGen = await this.aiGenRepo.findOne({
            where: { user: { id: userId }, type: AiGenerationType.TEXT },
            order: { createdAt: 'DESC' },
          });

          if (latestGen) {
            latestGen.fileUrl = fileUrl;
            latestGen.type = AiGenerationType.DOCUMENT;
            await this.aiGenRepo.save(latestGen);
          }
        }
      } catch (error) {
        this.logger.error('Error generating file:', error);
      }
    }

    return { content: result, fileUrl };
  }

  private parseDocumentContent(text: string): any {
    // Try to decode TOON first
    const toonBlocks = this.extractToonBlocks(text);
    if (toonBlocks.length > 0) {
      try {
        return decode(toonBlocks[0]);
      } catch (e) {
        this.logger.warn('Failed to decode TOON block in document content');
      }
    }
    
    // Fallback: simple split or return as is
    return { title: 'Document Généré', sections: [{ title: 'Contenu', text }] };
  }

  private extractToonBlocks(text: string): string[] {
    const regex = /toon\{[\s\S]*?\}/g;
    return text.match(regex) || [];
  }

  private async generatePdf(data: any, filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument();
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);
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
      stream.on('finish', () => resolve(filePath));
      stream.on('error', reject);
    });
  }

  private async generateDocx(data: any, filePath: string): Promise<string> {
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
    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  }

  private async generateExcel(data: any, filePath: string): Promise<string> {
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

    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  async applyWatermark(imageUrl: string, isPremium: boolean): Promise<string> {
    if (isPremium) {
      return imageUrl; // No watermark for premium
    }
    // Mock watermark logic
    return `${imageUrl}&watermark=hipster_studio`;
  }
}
