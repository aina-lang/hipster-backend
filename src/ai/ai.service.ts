import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import * as ExcelJS from 'exceljs';
import OpenAI from 'openai';
// Native fetch used

import { AiUser } from './entities/ai-user.entity';
import {
  AiGeneration,
  AiGenerationType,
} from './entities/ai-generation.entity';
import {
  AiSubscriptionProfile,
  PlanType,
} from '../profiles/entities/ai-subscription-profile.entity';

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
    this.openai = new OpenAI({ apiKey });
    this.logger.log('--- AiService Loaded ---');
  }

  /* --------------------- USER & HISTORY --------------------- */
  async getAiUserWithProfile(id: number) {
    return this.aiUserRepo.findOne({ where: { id }, relations: ['aiProfile'] });
  }

  async getHistory(userId: number) {
    return this.aiGenRepo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async deleteGeneration(id: number, userId: number): Promise<void> {
    const gen = await this.aiGenRepo.findOne({
      where: { id, user: { id: userId } },
    });
    if (!gen) throw new Error('Generation not found');
    await this.aiGenRepo.remove(gen);
  }

  async clearHistory(userId: number): Promise<void> {
    const gens = await this.aiGenRepo.find({ where: { user: { id: userId } } });
    if (gens.length > 0) await this.aiGenRepo.remove(gens);
  }

  /* --------------------- CHAT / TEXT --------------------- */
  async chat(messages: any[], userId?: number): Promise<string> {
    const start = Date.now();
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
      });
      const content = completion.choices[0].message.content || '';

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
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Erreur AI: ${msg}`);
    }
  }

  private async buildPrompt(params: any, userId?: number): Promise<string> {
    const {
      job,
      function: funcName,
      context,
      userQuery,
      workflowAnswers,
      instructions = '',
    } = params;

    let identityContext = '';
    let userName = "l'utilisateur";

    if (userId) {
      const userObj = await this.getAiUserWithProfile(userId);
      if (userObj) {
        userName = userObj.firstName || userObj.email;
        const profile = userObj.aiProfile;
        if (profile) {
          const parts = [
            `Nom: ${profile.companyName || userName}`,
            profile.professionalEmail
              ? `Email: ${profile.professionalEmail}`
              : '',
            profile.professionalAddress || profile.city || profile.postalCode
              ? `Adresse: ${profile.professionalAddress || ''} ${profile.city || ''} ${profile.postalCode || ''}`.trim()
              : '',
            profile.professionalPhone
              ? `Tél: ${profile.professionalPhone}`
              : '',
            profile.websiteUrl ? `Site: ${profile.websiteUrl}` : '',
          ].filter(Boolean);
          if (parts.length > 0)
            identityContext = `INFOS CONTACT/BRANDING:\n${parts.join('\n')}`;
        }
      }
    }

    const cleanFunction = (funcName || 'Création de contenu')
      .replace(/\s*\(.*?\)\s*/g, '')
      .trim();
    const workflowDetails = workflowAnswers
      ? Object.entries(workflowAnswers)
          .map(([k, v]) => `• ${k.replace(/_/g, ' ').toUpperCase()}: ${v}`)
          .join('\n')
      : '';

    const parts = [
      `Métier: ${job || 'Non spécifié'}`,
      `Type de contenu: ${cleanFunction}`,
      workflowDetails ? `Détails de personnalisation:\n${workflowDetails}` : '',
      context ? `Contexte supplémentaire: ${context}` : '',
      userQuery ? `Demande spécifique de l'utilisateur: ${userQuery}` : '',
      params.instruction_speciale
        ? `NOTE IMPORTANTE: ${params.instruction_speciale}`
        : '',
      instructions ? `Instructions de formatage: ${instructions}` : '',
      identityContext ? `\n${identityContext}` : '',
    ].filter(Boolean);

    return parts.join('\n\n');
  }

  async generateText(
    params: any,
    type: string,
    userId?: number,
  ): Promise<{ content: string; generationId?: number }> {
    if (typeof params === 'string') params = { userQuery: params };
    const basePrompt = await this.buildPrompt(params, userId);

    const systemContext = `
Identité: Hipster IA
Rôle: Expert assistant créatif
Contexte: Génération de contenu ${type}

RÈGLE CRITIQUE: N'INVENTE JAMAIS d'informations non fournies.
`;

    const messages = [
      { role: 'system', content: `Tu es Hipster IA. ${systemContext}` },
      { role: 'user', content: basePrompt },
    ];

    const result = await this.chat(messages);

    let generationId: number | undefined;
    if (userId) {
      const saved = await this.aiGenRepo.save({
        user: { id: userId } as AiUser,
        type: AiGenerationType.TEXT,
        prompt: basePrompt.substring(0, 1000),
        result,
        title: (params.userQuery || 'Sans titre').substring(0, 30) + '...',
        attributes: params,
      });
      generationId = saved.id;
    }

    return { content: result, generationId };
  }

  /* --------------------- IMAGE GENERATION --------------------- */
  private async checkLimits(userId: number, type: AiGenerationType) {
    const userProfile = await this.getAiUserWithProfile(userId);
    const plan = userProfile?.aiProfile?.planType || PlanType.CURIEUX;

    if (plan === PlanType.CURIEUX) {
      const createdAt = userProfile.createdAt;
      const now = new Date();
      const diffDays = Math.ceil(
        (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diffDays > 7)
        throw new Error("Votre période d'essai de 7 jours est terminée.");

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const count = await this.aiGenRepo.count({
        where: { user: { id: userId }, type, createdAt: MoreThan(today) },
      });

      if (type === AiGenerationType.IMAGE && count >= 2)
        throw new Error(
          'Limite atteinte : 2 images par jour avec le Pack Curieux.',
        );
      if (type === AiGenerationType.TEXT && count >= 3)
        throw new Error(
          'Limite atteinte : 3 textes par jour avec le Pack Curieux.',
        );
    }
    if (
      plan === PlanType.ATELIER &&
      (type === AiGenerationType.VIDEO || type === AiGenerationType.AUDIO)
    )
      throw new Error(
        'Le plan Atelier ne permet pas la génération Audio/Vidéo.',
      );
  }

  async generateImage(
    params: any,
    style: 'realistic' | 'cartoon' | 'sketch',
    userId?: number,
    manualNegativePrompt?: string,
  ) {
    if (userId) await this.checkLimits(userId, AiGenerationType.IMAGE);

    if (typeof params === 'string') params = { userQuery: params };
    const basePrompt = await this.buildPrompt(params, userId);
    const visualDescription = params.userQuery || '';
    const negativePrompt = manualNegativePrompt || '';

    this.logger.log(`Generating image with OpenAI: ${visualDescription}`);

    // Switching to a supported model as gpt-5.2-mini-image is invalid
    const response = await this.openai.images.generate({
      model: 'dall-e-3',
      prompt: `${visualDescription} ${negativePrompt ? `(Avoid: ${negativePrompt})` : ''}`,
      size: '1024x1024',
      n: 1,
    });

    const imageUrl = response.data[0].url;
    if (!imageUrl) throw new Error('Failed to generate image URL from OpenAI');

    // Download the image to save it locally as per project structure
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok)
      throw new Error('Failed to download generated image');
    const buffer = Buffer.from(await imageResponse.arrayBuffer());

    const uploadDir = path.join(process.cwd(), 'uploads', 'ai-generations');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const fileName = `gen_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.png`;
    const filePath = path.join(uploadDir, fileName);
    fs.writeFileSync(filePath, buffer);
    const publicUrl = `https://hipster-api.fr/uploads/ai-generations/${fileName}`;

    let generationId: number | undefined;
    if (userId) {
      const saved = await this.aiGenRepo.save({
        user: { id: userId } as AiUser,
        type: AiGenerationType.IMAGE,
        prompt: basePrompt.substring(0, 1000),
        result: publicUrl,
        title: (params.userQuery || 'AI Image').substring(0, 40),
        attributes: { ...params, engine: 'openai-dall-e-3' },
      });
      generationId = saved.id;
    }

    return { url: publicUrl, generationId };
  }

  /* --------------------- SOCIAL POSTS --------------------- */
  async generateSocial(params: any, userId?: number) {
    if (typeof params === 'string') params = { userQuery: params };
    const [textRes, imageRes] = await Promise.all([
      this.generateText(
        {
          ...params,
          instructions:
            'Génère légende pour post réseaux sociaux, sans inventer info, texte brut uniquement',
        },
        'social',
        userId,
      ),
      this.generateImage(
        { ...params, instructions: 'Image pour réseaux sociaux' },
        'realistic',
        userId,
      ),
    ]);

    return {
      content: textRes.content,
      url: imageRes.url,
      generationId: textRes.generationId,
    };
  }

  /* --------------------- DOCUMENTS --------------------- */
  async generateDocument(
    type: 'legal' | 'business',
    params: any,
    userId?: number,
  ) {
    const baseContext = await this.buildPrompt(params, userId);
    const prompt = JSON.stringify({ baseContext, type });
    const { content: resultText, generationId } = await this.generateText(
      prompt,
      'business',
      userId,
    );
    return { content: resultText, generationId };
  }

  async exportDocument(
    id: number,
    format: string,
    userId: number,
    model?: string,
  ) {
    const generation = await this.aiGenRepo.findOne({
      where: { id, user: { id: userId } },
    });
    if (!generation) throw new Error('Document non trouvé');

    const contentData = this.parseDocumentContent(generation.result);
    let buffer: Buffer;
    let mimeType: string;
    const fileName = `document_${id}.${format}`;

    switch (format.toLowerCase()) {
      case 'pdf':
        buffer = await this.generatePdfBuffer(contentData);
        mimeType = 'application/pdf';
        break;
      case 'docx':
        buffer = await this.generateDocxBuffer(contentData);
        mimeType =
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      case 'xlsx':
        buffer = await this.generateExcelBuffer(contentData);
        mimeType =
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;
      default:
        throw new Error('Format non supporté');
    }

    return { buffer, fileName, mimeType };
  }

  private parseDocumentContent(text: string) {
    try {
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonStr = text.substring(jsonStart, jsonEnd + 1);
        return JSON.parse(jsonStr);
      }
    } catch (e) {}
    return { title: 'Document', sections: [{ title: 'Contenu', text }] };
  }

  private async generatePdfBuffer(data: any) {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(`<html><body><h1>${data.title}</h1></body></html>`);
    const pdfBuffer = await page.pdf({ format: 'A4' });
    await browser.close();
    return Buffer.from(pdfBuffer);
  }

  private async generateDocxBuffer(data: any) {
    const children = [
      new Paragraph({
        children: [
          new TextRun({ text: data.title || 'Document', bold: true, size: 32 }),
        ],
      }),
    ];
    if (data.sections?.length) {
      data.sections.forEach((s: any) => {
        children.push(new Paragraph({ text: '' }));
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: s.title || '', bold: true, size: 28 }),
            ],
          }),
        );
        children.push(new Paragraph({ text: s.text || '' }));
      });
    }
    const doc = new Document({ sections: [{ children }] });
    return Buffer.from(await Packer.toBuffer(doc));
  }

  private async generateExcelBuffer(data: any) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Document');
    sheet.columns = [
      { header: 'Section', key: 'section', width: 30 },
      { header: 'Contenu', key: 'content', width: 70 },
    ];
    if (data.sections?.length)
      data.sections.forEach((s: any) =>
        sheet.addRow({ section: s.title, content: s.text }),
      );
    else sheet.addRow({ section: 'Contenu', content: data.title });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /* --------------------- FLYERS & POSTERS --------------------- */

  async generateFlyer(
    params: any,
    userId?: number,
    manualNegativePrompt?: string,
  ) {
    const flyerPrompt = this.constructFlyerPrompt(params);
    const systemNegative = this.constructNegativeFlyerPrompt();
    const negativePrompt = manualNegativePrompt
      ? `${systemNegative}, ${manualNegativePrompt}`
      : systemNegative;

    console.log('[generateFlyer] Using OpenAI with refined prompts');

    const imageResult = await this.generateImage(
      { ...params, userQuery: flyerPrompt },
      'realistic',
      userId,
      negativePrompt,
    );

    return {
      url: imageResult.url,
      imageData: imageResult.url, // For compatibility with controller destructuring
      generationId: imageResult.generationId,
    };
  }

  private constructFlyerPrompt(params: any): string {
    const { userQuery, title, businessName, workflowAnswers } = params;
    const userText = this.cleanUserPrompt(
      userQuery || title || businessName || 'Promotion',
    );

    const type = workflowAnswers?.type || 'Flyer';
    const style = workflowAnswers?.style || 'Modern';
    const promotion =
      workflowAnswers?.promotion && workflowAnswers.promotion !== 'Aucune'
        ? workflowAnswers.promotion
        : '';
    const tone = workflowAnswers?.tone || 'Professional';

    return `A clean, professional commercial ${type} layout. ${style} graphic design, high-quality composition,
     perfect alignment, bold readable typography, centered title, ${tone} message.
     ${promotion ? `Promotional focus: ${promotion}.` : ''}
     Include the following text exactly and fully visible, with correct spelling and spacing: "${userText}".
     Use a real ${type} design aesthetic, not a mockup. Use clean shapes, balanced layout,
     proper margins, and high-quality print-ready design. Vibrant but controlled colors.
     High resolution, sharp details.`.replace(/\s+/g, ' ');
  }

  private cleanUserPrompt(query: string): string {
    if (!query) return '';
    let cleaned = query.trim();

    // Common prefixes to remove (French/English)
    const prefixes = [
      /^cr[éeè]e[ -]moi (une|un) affiche/i,
      /^cr[éeè]e[ -]moi (une|un) flyer/i,
      /^cr[éeè]e[ -]moi (un|une) visuel/i,
      /^fais[ -]moi (une|un) affiche/i,
      /^fais[ -]moi (une|un) flyer/i,
      /^g[éeè]n[éeè]re (une|un) affiche/i,
      /^g[éeè]n[éeè]re (une|un) flyer/i,
      /^affiche pour /i,
      /^flyer pour /i,
      /^le[ -]texte[ -]est /i,
      /^make a flyer for/i,
      /^create a poster for/i,
      /^le sujet est/i,
    ];

    for (const regex of prefixes) {
      if (regex.test(cleaned)) {
        cleaned = cleaned.replace(regex, '').trim();
      }
    }

    // Capitalize first letter
    if (cleaned.length > 0) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }

    return cleaned;
  }

  private constructNegativeFlyerPrompt(): string {
    return `blurry text, distorted letters, gibberish, misspelled words, broken text, messy layout, 
    random symbols, fake language, poster mockup, watermark, low contrast, over-saturated colors, 
    chaotic design, noise, low resolution`.replace(/\s+/g, ' ');
  }

  async applyWatermark(url: string, isPremium: boolean): Promise<string> {
    // Simply returning the URL for now as requested or to simplify
    return url;
  }
}
