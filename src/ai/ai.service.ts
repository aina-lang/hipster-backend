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
    const { format: requestedFormat, function: funcName, userProfile, ...restParams } = params;
    
    // Clean format hints from function name (e.g., "(PDF / DOCX)")
    const cleanFunctionName = funcName ? funcName.replace(/\s*\(.*?\)\s*/g, '').trim() : funcName;
    const isInvoiceOrQuote = /devis|facture/i.test(cleanFunctionName || params.type);
    
    const toonParams = encode({
      ...restParams,
      function: cleanFunctionName,
    });

    let prompt = '';

    if (isInvoiceOrQuote) {
      // 1. Generate Invoice Number
      let docNumber = 'DOC-001';
      if (userId) {
        const count = await this.aiGenRepo.count({
          where: { user: { id: userId }, type: AiGenerationType.DOCUMENT }
        });
        const prefix = /devis/i.test(cleanFunctionName) ? 'DEVIS' : 'FACT';
        const year = new Date().getFullYear();
        docNumber = `${prefix}-${year}-${(count + 1).toString().padStart(3, '0')}`;
      }

      const senderInfo = userProfile ? {
        company: userProfile.companyName || `${userProfile.firstName} ${userProfile.lastName}`,
        address: userProfile.professionalAddress,
        city: `${userProfile.postalCode || ''} ${userProfile.city || ''}`.trim(),
        phone: userProfile.professionalPhone,
        email: userProfile.professionalEmail,
        siret: userProfile.siret,
        bank: userProfile.bankDetails
      } : {};

      const senderContext = Object.keys(senderInfo).length > 0 
        ? `Voici les infos de l'émetteur (Moi) : ${JSON.stringify(senderInfo)}` 
        : 'Invente les infos de l\'émetteur (Entreprise fictive) si non fournies (nom, adresse, siret).';

      prompt = `Génère un document ${cleanFunctionName} avec les paramètres suivants (format TOON) :\n${toonParams}\n\n${senderContext}\n\nINSTRUCTIONS CRITIQUES (Data Extraction) :
1. Numéro de document : Utilise "${docNumber}".
2. **EXTRACTION STRICTE** : Le champ "details" contient une liste sous "PRESTATIONS:".
   - Tu dois extraire CHAQUE ligne commençant par "- ".
   - La description, la quantité (Qté) et le prix (Prix) DOIVENT être repris EXACTEMENT tels quels.
   - NE CHANGE PAS LES PRIX fournis par l'utilisateur. C'est une obligation absolue.
   - Si l'utilisateur a écrit "Prix: 25", le prix unitaire EST 25. Point final.
   
3. **Complétion** : Uniquement si un prix est ABSENT ou vide, alors seulement tu peux l'estimer.
4. **Calculs** : Recalcule les totaux (Qté x Prix) toi-même pour garantir la cohérence mathématique.
5. **Mentions Légales** : TVA 20% (sauf exception), validité 30 jours.

IMPORTANT: Réponds UNIQUEMENT avec un JSON valide.
Structure JSON requise :
{
  "type": "invoice",
  "sender": { "name": "...", "address": "...", "contact": "...", "siret": "...", "bank": "..." },
  "client": { "name": "...", "address": "..." },
  "items": [ 
    { "description": "Reprendre texte user exactement...", "quantity": 1, "unitPrice": 25, "total": 25 } 
  ],
  "totals": { "subtotal": 0, "taxRate": 20, "taxAmount": 0, "total": 0 },
  "meta": { "date": "JJ/MM/AAAA", "dueDate": "JJ/MM/AAAA", "number": "${docNumber}" },
  "legal": "Mentions légales..."
}`;

    } else {
      // Generic Document (Keep Markdown as fallback)
      prompt = `Génère un document ${type} avec les paramètres suivants (format TOON) :\n${toonParams}\n\nIMPORTANT: Ta réponse doit être un document professionnel entièrement rédigé (pas de JSON).\n- Utilise le format Markdown.\n- Utilise un titre principal (# Titre).\n- Utilise des sous-titres pour les sections (## Titre Section).\n- Le contenu doit être clair, sans code, sans balises XML/JSON.`;
    }

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
    console.log('Parsed Content Data:', JSON.stringify(contentData, null, 2));

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
    console.log('Raw AI Output:', text);

    // 1. Try JSON Parsing
    try {
      // Find JSON object boundaries
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonStr = text.substring(jsonStart, jsonEnd + 1);
        const data = JSON.parse(jsonStr);

        // Case A: Structured Invoice/Quote
        if (data.items || data.sender || data.type === 'invoice' || data.type === 'quote') {
            console.log('Detected Structured Invoice/Quote JSON');
            return data;
        }

        // Case B: Minified Generic JSON (Legacy/Other)
        if (data.t || data.s) {
          return {
            title: data.t || 'Document',
            sections: Array.isArray(data.s) 
              ? data.s.map((sec: any) => ({
                  title: sec.st || '',
                  text: sec.c || ''
                }))
              : []
          };
        }
      }
    } catch (e) {
      console.warn('JSON parsing failed, falling back to Markdown/Text parser', e);
    }

    // 2. Fallback: Markdown Parser
    const docData: any = {
      title: 'Document',
      sections: []
    };

    const lines = text.split('\n');
    let currentSection: any = null;

    lines.forEach(line => {
      const trimmedLine = line.trim();
      
      if (trimmedLine.startsWith('# ')) {
        // Main Title
        docData.title = trimmedLine.substring(2).trim();
      } else if (trimmedLine.startsWith('## ')) {
        // New Section
        if (currentSection) {
          docData.sections.push(currentSection);
        }
        currentSection = {
          title: trimmedLine.substring(3).trim(),
          text: ''
        };
      } else {
        // Content
        if (currentSection) {
          currentSection.text += line + '\n';
        } else if (!trimmedLine.startsWith('#') && trimmedLine.length > 0) {
             if (docData.sections.length === 0 && !currentSection) {
                 currentSection = { title: 'Introduction', text: line + '\n' };
             } else if (currentSection) {
                 currentSection.text += line + '\n';
             }
        }
      }
    });

    if (currentSection) {
      docData.sections.push(currentSection);
    }
    
    // Clean up text
    docData.sections.forEach((sec: any) => {
        sec.text = sec.text.trim();
    });

    if (docData.sections.length === 0) {
        // Fallback if no markdown structure found
        return { title: 'Document Généré', sections: [{ title: 'Contenu', text }] };
    }

    return docData;
  }

  private extractToonBlocks(text: string): string[] {
    // Allow optional whitespace and case insensitivity
    const regex = /toon\s*\{[\s\S]*?\}/gi;
    return text.match(regex) || [];
  }

  private async generatePdfBuffer(data: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: any[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // --- INVOICE / QUOTE LAYOUT ---
      if (data.items && Array.isArray(data.items)) {
        const isQuote = data.type === 'quote' || (data.title && data.title.toLowerCase().includes('devis'));
        const titleText = isQuote ? 'DEVIS' : 'FACTURE';
        const primaryColor = '#333333';
        const secondaryColor = '#666666';

        // 1. HEADER
        doc.fontSize(20).text(titleText, { align: 'right' });
        doc.fontSize(10).text(`N° ${data.meta?.number || '---'}`, { align: 'right' });
        doc.text(`Date : ${data.meta?.date || new Date().toLocaleDateString()}`, { align: 'right' });
        doc.moveDown();

        // Sender (Left) vs Client (Right)
        const startY = doc.y;
        
        // Sender
        doc.fontSize(10).font('Helvetica-Bold').text('ÉMETTEUR', 50, startY);
        doc.font('Helvetica').fillColor(secondaryColor);
        if (data.sender) {
            doc.text(data.sender.name || '', 50, startY + 15);
            doc.text(data.sender.address || '', 50, startY + 30);
            doc.text(data.sender.contact || '', 50, startY + 45);
            doc.text(data.sender.email || '', 50, startY + 60);
        }

        // Client
        doc.fillColor('black').font('Helvetica-Bold').text('CLIENT', 300, startY);
        doc.font('Helvetica').fillColor(secondaryColor);
        if (data.client) {
            doc.text(data.client.name || 'Client', 300, startY + 15);
            doc.text(data.client.address || '', 300, startY + 30);
        }

        doc.moveDown(4);

        // 2. TABLE HEADERS
        const tableTop = doc.y + 20;
        const colDesc = 50;
        const colQty = 350;
        const colPrice = 410;
        const colTotal = 490;

        doc.font('Helvetica-Bold').fillColor('black');
        doc.text('Description', colDesc, tableTop);
        doc.text('Qté', colQty, tableTop);
        doc.text('Prix U.', colPrice, tableTop);
        doc.text('Total', colTotal, tableTop);

        doc.lineWidth(1).moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

        // 3. TABLE ROWS
        let y = tableTop + 25;
        doc.font('Helvetica').fontSize(10);

        data.items.forEach((item: any) => {
            const desc = item.description || 'Service';
            const qty = item.quantity || 1;
            const price = item.unitPrice || 0;
            const total = item.total || (qty * price);

            doc.text(desc, colDesc, y, { width: 280 });
            doc.text(qty.toString(), colQty, y);
            doc.text(`${price} €`, colPrice, y);
            doc.text(`${total} €`, colTotal, y);
            
            y += 20;
            // Simple validation for page break could be added here
        });

        doc.lineWidth(1).moveTo(50, y).lineTo(550, y).stroke();
        y += 10;

        // 4. TOTALS
        if (data.totals) {
            const offsetRight = 400;
            doc.font('Helvetica-Bold');
            doc.text('Total HT:', offsetRight, y);
            doc.font('Helvetica').text(`${data.totals.subtotal || 0} €`, colTotal, y);
            y += 15;
            
            doc.font('Helvetica-Bold');
            doc.text('TVA (20%):', offsetRight, y);
            doc.font('Helvetica').text(`${data.totals.taxAmount || 0} €`, colTotal, y);
            y += 15;

            doc.rect(offsetRight - 10, y - 5, 200, 25).fill('#f0f0f0');
            doc.fillColor('black');
            doc.fontSize(12).text('TOTAL TTC:', offsetRight, y);
            doc.text(`${data.totals.total || 0} €`, colTotal, y);
        }

        // 5. FOOTER / LEGAL
        doc.moveDown(4);
        doc.fontSize(9).fillColor('#888888');
        if (data.legal) {
            doc.text('Conditions & Mentions Légales :', 50);
            doc.text(data.legal, { width: 500 });
        }

        if (data.sender?.bank) {
            doc.moveDown();
            doc.text(`Informations Bancaires : ${data.sender.bank}`, 50);
        }

      } else {
        // --- GENERIC LAYOUT ---
        doc.fontSize(20).text(data.title || 'Document', { align: 'center' });
        doc.moveDown();

        if (data.sections && Array.isArray(data.sections)) {
          data.sections.forEach((section: any) => {
            doc.fontSize(14).font('Helvetica-Bold').text(section.title || '', { underline: true });
            doc.fontSize(12).font('Helvetica').text(section.text || '');
            doc.moveDown();
          });
        } else if (typeof data === 'string') {
          doc.fontSize(12).text(data);
        } else {
          doc.fontSize(12).text(JSON.stringify(data, null, 2));
        }
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
