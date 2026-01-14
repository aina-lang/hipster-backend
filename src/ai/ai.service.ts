import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiUser } from './entities/ai-user.entity';
import {
  AiGeneration,
  AiGenerationType,
} from './entities/ai-generation.entity';

import OpenAI from 'openai';

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
        const lastUserMsg = messages.filter((m) => m.role === 'user').pop();
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Erreur AI: ${errorMessage}`);
    }
  }

  async generateText(
    prompt: string,
    type: string,
    userId?: number,
  ): Promise<string> {
    let userName = "l'utilisateur";
    if (userId) {
      const userObj = await this.aiUserRepo.findOne({ where: { id: userId } });
      if (userObj?.firstName) {
        userName = userObj.firstName;
      }
    }

    const systemContext = `
      Identité: Hipster IA
      Rôle: Expert assistant créatif
      Cible: ${userName}
      Contexte: Génération de contenu ${type}
    `;

    const messages = [
      {
        role: 'system',
        content: `Tu es Hipster IA. Voici ta configuration :\n${systemContext}\n\nRéponds au format JSON si possible pour une meilleure extraction des données, sinon utilise un format clair et structuré.`,
      },
      { role: 'user', content: prompt },
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
    console.log(`--- GENERATE IMAGE (DALL-E 3) ---`);
    console.log(`Prompt: ${prompt}`);
    console.log(`Style param: ${style}`);

    // Map legacy styles to DALL-E 3 compatible prompt enhancements
    // DALL-E 3 supports 'style': 'vivid' | 'natural'.
    // We will use 'vivid' for most marketing content to make it pop.
    let enhancedPrompt = prompt;
    let dalleStyle: 'vivid' | 'natural' = 'vivid';

    if (style === 'cartoon') {
      enhancedPrompt += ' . Style: Cartoon, vibrant colors, flat design.';
      dalleStyle = 'vivid';
    } else if (style === 'sketch') {
      enhancedPrompt += ' . Style: Pencil sketch, artistic, black and white.';
      dalleStyle = 'natural';
    } else {
      // realistic
      enhancedPrompt +=
        ' . Style: Photorealistic, high quality, 4k, professional photography.';
      dalleStyle = 'natural'; // Natural often looks more realistic for photos
    }

    try {
      const response = await this.openai.images.generate({
        model: 'dall-e-3',
        prompt: enhancedPrompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard', // or 'hd' ($0.08 vs $0.04)
        style: dalleStyle,
        response_format: 'url',
      });

      const url = response.data[0].url;
      console.log('--- IMAGE GENERATED ---');
      console.log('URL:', url);

      if (userId && url) {
        await this.aiGenRepo.save({
          user: { id: userId } as AiUser,
          type: AiGenerationType.IMAGE,
          prompt: enhancedPrompt,
          result: 'Image DALL-E 3',
          imageUrl: url,
          title: prompt.substring(0, 30) + '...',
        });
      }

      return url || '';
    } catch (error) {
      console.error('--- OPENAI IMAGE ERROR ---');
      console.error(error);
      throw new Error("Erreur lors de la génération d'image");
    }
  }

  async generateDocument(
    type: 'legal' | 'business',
    params: any,
    userId?: number,
  ): Promise<{ content: string; generationId?: number }> {
    const {
      format: requestedFormat,
      function: funcName,
      userProfile,
      ...restParams
    } = params;

    // Clean format hints like "(PDF / DOCX)"
    const cleanFunctionName = funcName
      ? funcName.replace(/\s*\(.*?\)\s*/g, '').trim()
      : 'Document';

    const isQuoteEstimate = /devis|estimation|estimate/i.test(
      cleanFunctionName,
    );

    // Entity name (Company or User)
    const entityName =
      userProfile?.companyName ||
      (userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : null);

    const paramsStr = JSON.stringify(
      { ...restParams, function: cleanFunctionName, entityName },
      null,
      2,
    );

    let prompt = '';

    /* -------------------------------------------------------------------------- */
    /*                         CASE A — QUOTE / ESTIMATION                        */
    /* -------------------------------------------------------------------------- */
    if (isQuoteEstimate) {
      let docNumber = 'DOC-001';

      // Generate incremental document number
      if (userId) {
        const count = await this.aiGenRepo.count({
          where: { user: { id: userId }, type: AiGenerationType.DOCUMENT },
        });

        const prefix = 'DEVIS';
        const year = new Date().getFullYear();
        docNumber = `${prefix}-${year}-${String(count + 1).padStart(3, '0')}`;
      }

      // Sender details
      const senderInfo = userProfile
        ? {
            company:
              userProfile.companyName ||
              `${userProfile.firstName} ${userProfile.lastName}`,
            address: userProfile.professionalAddress,
            city: `${userProfile.postalCode || ''} ${userProfile.city || ''}`.trim(),
            phone: userProfile.professionalPhone,
            email: userProfile.professionalEmail,
            siret: userProfile.siret,
            bank: userProfile.bankDetails,
          }
        : {};

      const senderContext =
        Object.keys(senderInfo).length > 0
          ? `Voici les infos de l'émetteur : ${JSON.stringify(senderInfo)}`
          : 'Invente des informations réalistes d’entreprise si non fournies.';

      /* ----------------------------- QUOTE PROMPT ----------------------------- */
      prompt = `
Génère un document "${cleanFunctionName}" avec les paramètres suivants :
${paramsStr}

${senderContext}

MODE ESTIMATEUR INTELLIGENT :
1. Numéro du document : "${docNumber}"
2. Estimation automatique des coûts :
   - Analyse la demande même si elle est vague.
   - Estime matériaux, main d'œuvre, temps, quantités.
   - Utilise des prix réalistes basés sur le marché.
3. Structure : Document professionnel de type DEVIS.
4. TVA : 20%
5. Validité : 30 jours

IMPORTANT : Tu dois répondre UNIQUEMENT avec ce JSON valide :

{
  "type": "invoice",
  "sender": { "name": "...", "address": "...", "contact": "...", "siret": "...", "bank": "..." },
  "client": { "name": "Client", "address": "..." },
  "items": [
    { "description": "Description...", "quantity": 1, "unitPrice": 100, "total": 100 }
  ],
  "totals": { "subtotal": 0, "taxRate": 20, "taxAmount": 0, "total": 0 },
  "meta": { "date": "JJ/MM/AAAA", "dueDate": "JJ/MM/AAAA", "number": "${docNumber}" },
  "legal": "Mentions légales..."
}
`.trim();
    } else {
      /* -------------------------------------------------------------------------- */
      /*                  CASE B — GENERIC BUSINESS DOCUMENT (UNIFORM)              */
      /* -------------------------------------------------------------------------- */
      const docTitle = cleanFunctionName.toUpperCase();

      prompt = `
Génère un document "${docTitle}" structuré.
Paramètres de génération :
${paramsStr}

IMPORTANT : Tu dois impérativement répondre avec un objet JSON valide suivant cette structure :
{
  "title": "${docTitle}",
  "presentation": "Bref texte d'introduction (3-5 phrases)",
  "sections": [
    {
      "title": "Titre de section",
      "content": "Contenu détaillé de la section",
      "table": [
        ["Colonne 1", "Colonne 2", "Colonne 3"],
        ["Valeur 1", "Valeur 2", "Valeur 3"]
      ]
    }
  ],
  "conclusion": "Phrase courte et professionnelle"
}

Règles de rédaction :
- Le contenu doit être professionnel et complet.
- INTERDICTION D'INVENTER : N'ajoute AUCUN service ou prix non mentionné.
- Si des prestations sont listées, utilise le champ "table" pour les structurer.
`.trim();
    }

    /* -------------------------------------------------------------------------- */
    /*                              GENERATION AI                                 */
    /* -------------------------------------------------------------------------- */
    const result = await this.generateText(prompt, 'business', userId);

    /* -------------------------------------------------------------------------- */
    /*                        SAVE GENERATION HISTORY                              */
    /* -------------------------------------------------------------------------- */
    let generationId: number | undefined;

    if (userId) {
      try {
        const latestGen = await this.aiGenRepo.findOne({
          where: { user: { id: userId }, type: AiGenerationType.TEXT },
          order: { createdAt: 'DESC' },
        });

        if (latestGen) {
          latestGen.type = AiGenerationType.DOCUMENT;
          if (params.workflowAnswers) {
            latestGen.attributes = params.workflowAnswers;
          }
          const savedGen = await this.aiGenRepo.save(latestGen);
          generationId = savedGen.id;
        }
      } catch (error) {
        this.logger.error('Error updating generation record:', error);
      }
    }

    return { content: result, generationId };
  }

  async exportDocument(
    id: number,
    format: string,
    userId: number,
    modelOverride?: string,
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const generation = await this.aiGenRepo.findOne({
      where: { id, user: { id: userId } },
    });

    if (!generation) {
      throw new Error('Document non trouvé');
    }

    const contentData = this.parseDocumentContent(generation.result);
    const model = modelOverride || generation.attributes?.model || 'Moderne';
    console.log('Exporting with model:', model);

    const fileName = `document_${id}.${format}`;
    let buffer: Buffer;
    let mimeType: string;

    switch (format.toLowerCase()) {
      case 'pdf':
        buffer = await this.generatePdfBuffer(contentData, model);
        mimeType = 'application/pdf';
        break;
      case 'docx':
        buffer = await this.generateDocxBuffer(contentData);
        mimeType =
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      case 'xlsx':
      case 'excel':
        buffer = await this.generateExcelBuffer(contentData);
        mimeType =
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;
      case 'image':
      case 'png':
        buffer = await this.generateImageBuffer(contentData, model);
        mimeType = 'image/png';
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
        if (
          data.items ||
          data.sender ||
          data.type === 'invoice' ||
          data.type === 'quote'
        ) {
          console.log('Detected Structured Invoice/Quote JSON');
          return data;
        }

        // Case C: New Structured Document JSON
        if (data.presentation || data.sections || data.conclusion) {
          console.log('Detected Structured Document JSON');
          return {
            title: data.title || 'Document',
            presentation: data.presentation || '',
            sections: Array.isArray(data.sections)
              ? data.sections.map((s: any) => ({
                  title: s.title || '',
                  text: s.content || '',
                  table: s.table || null,
                }))
              : [],
            conclusion: data.conclusion || '',
          };
        }

        // Case B: Minified Generic JSON (Legacy/Other)
        if (data.t || data.s) {
          return {
            title: data.t || 'Document',
            sections: Array.isArray(data.s)
              ? data.s.map((sec: any) => ({
                  title: sec.st || '',
                  text: sec.c || '',
                }))
              : [],
          };
        }
      }
    } catch (e) {
      console.warn(
        'JSON parsing failed, falling back to Markdown/Text parser',
        e,
      );
    }

    // 2. Fallback: Markdown Parser
    const docData: any = {
      title: 'Document',
      sections: [],
    };

    const lines = text.split('\n');
    let currentSection: any = null;

    lines.forEach((line) => {
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
          text: '',
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
      return {
        title: 'Document Généré',
        sections: [{ title: 'Contenu', text }],
      };
    }

    return docData;
  }

  private extractToonBlocks(text: string): string[] {
    // Allow optional whitespace and case insensitivity
    const regex = /toon\s*\{[\s\S]*?\}/gi;
    return text.match(regex) || [];
  }

  private async generatePdfBuffer(
    data: any,
    model: string = 'Moderne',
  ): Promise<Buffer> {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      const htmlContent = this.getDocumentHtml(data, model);
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
      });

      await browser.close();
      return Buffer.from(pdfBuffer);
    } catch (error) {
      console.error('PDF generation error:', error);
      if (browser) await browser.close();
      throw error;
    }
  }

  private async generateDocxBuffer(data: any): Promise<Buffer> {
    const children = [
      new Paragraph({
        children: [
          new TextRun({ text: data.title || 'Document', bold: true, size: 32 }),
        ],
      }),
    ];

    if (data.sections && Array.isArray(data.sections)) {
      data.sections.forEach((section: any) => {
        children.push(new Paragraph({ text: '' }));
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: section.title || '', bold: true, size: 28 }),
            ],
          }),
        );
        children.push(new Paragraph({ text: section.text || '' }));
      });
    } else {
      children.push(new Paragraph({ text: JSON.stringify(data, null, 2) }));
    }

    const doc = new Document({ sections: [{ children }] });
    return (await Packer.toBuffer(doc)) as Buffer;
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

  private async generateImageBuffer(
    data: any,
    model: string = 'Moderne',
  ): Promise<Buffer> {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      const htmlContent = this.getDocumentHtml(data, model);
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      // Auto-size viewport to content
      const bodyHandle = await page.$('body');
      const box = await bodyHandle.boundingBox();
      if (box) {
        await page.setViewport({
          width: Math.ceil(box.width),
          height: Math.ceil(box.height),
        });
      }

      const imageBuffer = await page.screenshot({ fullPage: true });
      await browser.close();
      return Buffer.from(imageBuffer);
    } catch (error) {
      console.error('Image generation error:', error);
      await browser.close();
      throw error;
    }
  }

  private getDocumentHtml(data: any, model: string = 'Moderne'): string {
    const title = data.title || 'Document';
    const presentation = data.presentation || '';
    const sections = data.sections || [];
    const conclusion = data.conclusion || '';

    let themeStyles = '';

    // THEMES CSS
    if (model === 'Minimaliste') {
      themeStyles = `
        body { background: #ffffff; color: #000000; font-family: 'Helvetica', sans-serif; }
        h1 { color: #000; border-bottom: 1px solid #000; padding-bottom: 5px; font-weight: 300; text-transform: uppercase; letter-spacing: 2px; }
        .section-title { color: #333; border-left: 3px solid #000; padding-left: 10px; font-size: 18px; text-transform: uppercase; }
        th { background: #f0f0f0; color: #000; border-bottom: 2px solid #000; }
        td { border-bottom: 1px solid #eee; }
      `;
    } else if (model === 'Luxe') {
      themeStyles = `
        body { background: #0a0a0a; color: #ffffff; font-family: 'Georgia', serif; }
        h1 { color: #D4AF37; border-bottom: 2px solid #D4AF37; font-style: italic; }
        .section-title { color: #D4AF37; font-variant: small-caps; border-bottom: 1px solid rgba(212, 175, 55, 0.3); }
        table { border: 1px solid #D4AF37; }
        th { background: #D4AF37; color: #000; }
        td { border-bottom: 1px solid rgba(212, 175, 55, 0.2); }
        .conclusion { color: #D4AF37; }
      `;
    } else if (model === 'Coloré') {
      themeStyles = `
        body { background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); color: #2d3436; }
        .container { background: white; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); padding: 40px; }
        h1 { background: linear-gradient(to right, #6c5ce7, #00cec9); -webkit-background-clip: text; -webkit-text-fill-color: transparent; border-bottom: none; }
        .section-title { color: #6c5ce7; font-weight: 800; }
        th { background: #6c5ce7; color: white; border-radius: 5px 5px 0 0; }
        tr:nth-child(even) { background-color: #f1f2f6; }
      `;
    } else {
      // MODERNE (Default Hipster Style)
      themeStyles = `
        body { background: #0a0a0a; color: #ffffff; font-family: 'Helvetica', sans-serif; }
        h1 { color: #00FFAA; text-shadow: 0 0 10px rgba(0,255,170,0.3); border-bottom: 2px solid #00FFAA; }
        .section-title { color: #00FFAA; text-transform: uppercase; letter-spacing: 1px; }
        th { background: #00FFAA; color: #000; }
        td { border-bottom: 1px solid rgba(255,255,255,0.1); }
        .conclusion { color: #00FFAA; }
      `;
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { line-height: 1.6; padding: 40px; margin: 0; display: flex; justify-content: center; }
          .container { width: 100%; max-width: 800px; }
          h1 { text-align: center; padding-bottom: 10px; margin-bottom: 30px; font-size: 32px; }
          .presentation { font-size: 16px; margin-bottom: 30px; line-height: 1.8; opacity: 0.9; }
          .section { margin-bottom: 30px; }
          .section-title { font-size: 20px; margin-bottom: 15px; font-weight: bold; }
          .section-text { font-size: 15px; margin-bottom: 15px; opacity: 0.8; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { padding: 12px; text-align: left; font-size: 14px; }
          td { padding: 12px; font-size: 14px; }
          .conclusion { margin-top: 40px; padding-top: 20px; border-top: 1px solid rgba(128,128,128,0.2); font-style: italic; font-size: 15px; }
          ${themeStyles}
        </style>
      </head>
      <body>
        <div class="container">
          <h1>${title}</h1>
          ${presentation ? `<div class="presentation">${presentation}</div>` : ''}
          
          ${sections
            .map(
              (s: any) => `
            <div class="section">
              ${s.title ? `<div class="section-title">${s.title}</div>` : ''}
              ${s.text || s.content ? `<div class="section-text">${s.text || s.content}</div>` : ''}
              ${
                s.table && Array.isArray(s.table) && s.table.length > 0
                  ? `
                <table>
                  <thead>
                    <tr>
                      ${s.table[0].map((h: string) => `<th>${h}</th>`).join('')}
                    </tr>
                  </thead>
                  <tbody>
                    ${s.table
                      .slice(1)
                      .map(
                        (row: any[]) => `
                      <tr>
                        ${row.map((cell) => `<td>${cell}</td>`).join('')}
                      </tr>
                    `,
                      )
                      .join('')}
                  </tbody>
                </table>
              `
                  : ''
              }
            </div>
          `,
            )
            .join('')}

          ${conclusion ? `<div class="conclusion">${conclusion}</div>` : ''}
        </div>
      </body>
      </html>
    `;
  }
}
