import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, Raw } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import * as ExcelJS from 'exceljs';
import OpenAI from 'openai';
// Native fetch used

import { AiUser, PlanType } from './entities/ai-user.entity';
import {
  AiGeneration,
  AiGenerationType,
} from './entities/ai-generation.entity';
import { AiPaymentService } from '../ai-payment/ai-payment.service';

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
    private readonly aiPaymentService: AiPaymentService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.openai = new OpenAI({ apiKey });
    this.logger.log('--- AiService Loaded ---');
  }

  /* --------------------- USER & HISTORY --------------------- */
  async getAiUserWithProfile(id: number) {
    return this.aiUserRepo.findOne({
      where: { id },
    });
  }

  async getHistory(userId: number) {
    const history = await this.aiGenRepo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
      select: [
        'id',
        'type',
        'title',
        'createdAt',
        'attributes',
        'imageUrl',
        'fileUrl',
      ],
      take: 50,
    });

    // Filter out usage logs that were created just for credit decrementing
    // We only want to show the main conversations (type: CHAT) and other standalone generations
    const filtered = history.filter((item) => {
      let attrs = item.attributes;
      if (typeof attrs === 'string') {
        try {
          attrs = JSON.parse(attrs);
        } catch (e) {
          // ignore error
        }
      }

      const isUsageLog =
        (attrs as any)?.isUsageLog === true ||
        (attrs as any)?.isUsageLog === 'true' ||
        (attrs as any)?.isUsageLog === 1;

      // Also exclude if it's a sub-item of a CHAT (has conversationId in attributes and is not CHAT itself)
      const isSubItem =
        item.type !== AiGenerationType.CHAT && (attrs as any)?.conversationId;

      return !isUsageLog && !isSubItem;
    });

    const breakdown = filtered.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {});

    this.logger.log(
      `[getHistory] Total: ${history.length}, Filtered: ${filtered.length}. Breakdown: ${JSON.stringify(breakdown)}`,
    );
    return filtered;
  }

  async getConversation(conversationId: number, userId: number) {
    return this.aiGenRepo.findOne({
      where: { id: conversationId, user: { id: userId } },
    });
  }

  async deleteGeneration(id: number, userId: number): Promise<void> {
    this.logger.log(
      `[deleteGeneration] Request to delete ${id} for user ${userId}`,
    );
    const gen = await this.aiGenRepo.findOne({
      where: { id, user: { id: userId } },
    });
    if (!gen) {
      this.logger.warn(`[deleteGeneration] Generation ${id} not found`);
      throw new Error('Generation not found');
    }

    // If it's a CHAT, also delete related TEXT logs (usage tracking)
    if (gen.type === AiGenerationType.CHAT) {
      this.logger.log(
        `[deleteGeneration] Deleting related usage logs for chat ${id}`,
      );
      await this.aiGenRepo.delete({
        user: { id: userId },
        type: AiGenerationType.TEXT,
        attributes: Raw((alias) => `${alias} ->> 'conversationId' = '${id}'`),
      });
    }

    await this.aiGenRepo.remove(gen);
    this.logger.log(`[deleteGeneration] Successfully deleted ${id}`);
  }

  async clearHistory(userId: number): Promise<void> {
    const gens = await this.aiGenRepo.find({ where: { user: { id: userId } } });
    if (gens.length > 0) await this.aiGenRepo.remove(gens);
  }

  /* --------------------- CHAT / TEXT --------------------- */
  async chat(
    messages: any[],
    userId?: number,
    conversationId?: string | number,
    isUsageLog: boolean = false,
  ): Promise<{ content: string; conversationId?: string }> {
    const start = Date.now();
    try {
      if (userId) {
        // Fetch user
        const user = await this.aiUserRepo.findOne({
          where: { id: userId },
        });

        if (!user) {
          throw new ForbiddenException('Utilisateur non trouvé');
        }

        // Check limits before proceeding
        await this.aiPaymentService.decrementCredits(
          userId,
          AiGenerationType.TEXT,
        );
      }

      // Call OpenAI API
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
      });
      const content = completion.choices[0].message.content || '';

      let generationId: string | undefined;

      if (userId) {
        let generation: AiGeneration;

        // Normalize conversationId to handle null/undefined/empty string
        const cid =
          conversationId &&
          conversationId !== 'null' &&
          conversationId !== 'undefined'
            ? parseInt(conversationId.toString())
            : null;

        if (cid) {
          // Update existing conversation
          generation = await this.aiGenRepo.findOne({
            where: { id: cid, user: { id: userId } },
          });

          if (generation) {
            // Update the existing conversation
            generation.result = content;
            generation.prompt = JSON.stringify(messages); // Store full conversation history
            generation.createdAt = new Date(); // Update timestamp to bring to top of history
            await this.aiGenRepo.save(generation);
            this.logger.log(`Updated conversation ${cid} for user ${userId}`);
          } else {
            this.logger.warn(`Conversation ${cid} not found, creating new one`);
          }
        }

        if (!generation) {
          // Create new conversation
          const firstUserMsg = messages.find((m) => m.role === 'user');
          generation = await this.aiGenRepo.save({
            user: { id: userId } as AiUser,
            type: AiGenerationType.CHAT,
            prompt: JSON.stringify(messages),
            result: content,
            attributes: isUsageLog ? { isUsageLog: true } : {},
            title:
              (firstUserMsg?.content?.substring(0, 50) || 'Conversation') +
              '...',
          });
          this.logger.log(
            `Created new conversation ${generation.id} for user ${userId} (UsageLog: ${isUsageLog})`,
          );
        }

        generationId = generation.id.toString();

        // Save a separate usage record of type TEXT for EACH turn in the conversation,
        // but ONLY for Free Mode (where isUsageLog is false).
        // Guided Mode (where isUsageLog is true) already saves its own TEXT record.
        if (!isUsageLog) {
          const lastUserMsg = [...messages]
            .reverse()
            .find((m) => m.role === 'user');
          await this.aiGenRepo.save({
            user: { id: userId } as AiUser,
            type: AiGenerationType.TEXT,
            prompt: lastUserMsg?.content || 'Chat message',
            result: content,
            attributes: {
              isUsageLog: true,
              conversationId: generation.id,
            },
          });
        }
      }

      return { content, conversationId: generationId };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
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
      tone,
      target,
      instructions = '',
    } = params;

    let identityContext = '';
    let userName = "l'utilisateur";

    if (userId) {
      const userObj = await this.getAiUserWithProfile(userId);
      if (userObj) {
        userName = userObj.name || userObj.email;
        const parts = [
          `Nom: ${userName}`,
          userObj.professionalEmail
            ? `Email: ${userObj.professionalEmail}`
            : '',
          userObj.professionalAddress || userObj.city || userObj.postalCode
            ? `Adresse: ${userObj.professionalAddress || ''} ${userObj.city || ''} ${userObj.postalCode || ''}`.trim()
            : '',
          userObj.professionalPhone ? `Tél: ${userObj.professionalPhone}` : '',
          userObj.websiteUrl ? `Site: ${userObj.websiteUrl}` : '',
        ].filter(Boolean);
        if (parts.length > 0)
          identityContext = `INFOS CONTACT/BRANDING:\n${parts.join('\n')}`;
      }
    }

    const cleanFunction = (funcName || 'Création de contenu')
      .replace(/\s*\(.*?\)\s*/g, '')
      .trim();
    const workflowDetails = workflowAnswers
      ? Object.entries(workflowAnswers)
          .map(([k, v]) => `• ${k.replace(/_/g, ' ').toUpperCase()}: ${v}`)
          .join('\n')
          .substring(0, 1000)
      : '';

    const parts = [
      `Métier: ${job || 'Non spécifié'}`,
      `Catégorie: ${params.category || 'Non spécifiée'}`,
      `Type de contenu: ${cleanFunction}`,
      params.style ? `Style visuel souhaité: ${params.style}` : '',
      params.intention ? `Intention du message: ${params.intention}` : '',
      tone ? `Ton de voix: ${tone}` : '',
      target ? `Cible visée: ${target}` : '',
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

    if (userId)
      await this.aiPaymentService.decrementCredits(
        userId,
        AiGenerationType.TEXT,
      );
    // Use isUsageLog = true to avoid Guided Mode background chat from appearing in history
    const chatResult = await this.chat(messages, userId, null, true);
    const result = chatResult.content;

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

async generateImage(
  params: {
    job: string;
    function: string;
    userQuery: string;
  },
  style: 'Monochrome' | 'Hero Studio' | 'Minimal Studio',
  userId?: number,
  file?: Express.Multer.File,
) {
  this.logger.log(`[generateImage] START - Style: ${style}, UserId: ${userId}`);

  if (userId) {
    await this.aiPaymentService.decrementCredits(userId, AiGenerationType.IMAGE);
  }

  // ------------------------------------------------------------------
  // RANDOMIZATION POOLS
  // ------------------------------------------------------------------
  const getRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  const accentColors = ['red', 'orange', 'deep purple'];

  // ------------------------------------------------------------------
  // PARAMS INJECTION
  // ------------------------------------------------------------------
  const { job, function: functionName, userQuery } = params;

  // Fetch user name for branding if needed
  let brandName = '';
  if (userId) {
    const userObj = await this.getAiUserWithProfile(userId);
    if (userObj) brandName = userObj.name || '';
  }

  // ------------------------------------------------------------------
  // VISUAL DESCRIPTION GENERATION
  // ------------------------------------------------------------------
  let visualDescription = '';
  let negativePrompt = `
text, typography, letters, words, numbers, watermark, logo, signature,
AI artifacts, CGI, illustration, cartoon, blur, low resolution,
extra limbs, unrealistic proportions, oversaturated, messy background
`.trim();

  if (style === 'Monochrome') {
    const subject = `
Professional visual related to "${job}",
created for "${functionName}",
concept: "${userQuery}".
`.trim();

    visualDescription = `
Ultra high contrast black and white composition, deep cinematic contrast, dramatic light sculpting, strong chiaroscuro, editorial campaign poster aesthetic.
Minimalist environment with dominant negative space, refined visual hierarchy, controlled shadows and highlights, carefully balanced exposure.
Primary subject: ${subject}, represented realistically and authentically.
Dynamic asymmetrical composition, subject position optimized for balance, not centering.
Luxury branding aesthetic, premium campaign visual, high-end magazine quality, modern art direction, fine art photography style.
Ultra sharp focus on key subject textures: refined material rendering (metal, glass, stone, fabric, organic textures), natural human presence if applicable.
Large subtle typography may appear minimally for branding purposes, without distracting from realism.
Graphic design elements included: thin geometric lines, subtle frame corners, layout guides, modern poster grid system, refined spatial alignment.
Color: Monochrome black and white with one minimal accent color (${getRandom(accentColors)}) used ONLY in small geometric highlights or thin lines.
Professional studio lighting, cinematic atmosphere, dramatic shadow gradients.
The image must look like a real photograph, photorealistic, with no CGI, no digital painting, no AI artifacts.
`.trim();
  }

  // ------------------------------------------------------------------
  // CALL STABILITY.AI API
  // ------------------------------------------------------------------
  const apiKey = this.configService.get('STABLE_API_KEY') || this.configService.get('STABILITY_API_KEY');
  if (!apiKey) throw new Error('Missing STABILITY API KEY');

  const endpoint = 'https://api.stability.ai/v2beta/stable-image/generate/core';
  const model = 'sd3.5-large-turbo';
  const outputFormat = 'png';

  const formData = new FormData();
  formData.append('prompt', visualDescription);
  formData.append('negative_prompt', negativePrompt);
  formData.append('output_format', outputFormat);
  formData.append('aspect_ratio', '1:1');
  formData.append('model', model);

  if (params['seed']) formData.append('seed', params['seed'].toString());

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min

  this.logger.log(`[generateImage] Calling Stability AI endpoint: ${endpoint}`);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'image/*',
      },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`[generateImage] Stability AI error: ${response.status} - ${err}`);
      throw new Error(`Stability AI failed: ${response.status} - ${err}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const uploadDir = path.join(process.cwd(), 'uploads', 'ai-generations');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const fileName = `gen_${Date.now()}_${crypto.randomBytes(5).toString('hex')}.${outputFormat}`;
    const filePath = path.join(uploadDir, fileName);

    fs.writeFileSync(filePath, buffer);

    const publicUrl = `https://hipster-api.fr/uploads/ai-generations/${fileName}`;
    this.logger.log(`[generateImage] SUCCESS - Image saved: ${fileName}`);

    return {
      url: publicUrl,
      generationId: null,
    };
  } catch (error) {
    this.logger.error(`[generateImage] FATAL ERROR:`, error);
    throw error;
  }
}

  /* --------------------- SOCIAL POSTS --------------------- */
  async generateSocial(
    params: any,
    userId?: number,
    file?: Express.Multer.File,
  ) {
    if (typeof params === 'string') params = { userQuery: params };

    // Only generate image, no text per user request
    const selectedStyle = params.style || 'Minimal Studio';
    const imageRes = await this.generateImage(
      { ...params, instructions: 'Image pour réseaux sociaux' },
      selectedStyle as any,
      userId,
      file,
    );

    return {
      content: '', // No text content
      url: imageRes.url,
      generationId: imageRes.generationId,
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
    file?: Express.Multer.File,
  ) {
    const flyerPrompt = this.constructFlyerPrompt(params);
    const systemNegative = this.constructNegativeFlyerPrompt();

    console.log('[generateFlyer] Using OpenAI with refined prompts');

    const selectedStyle = params.style || 'Minimal Studio';
    const imageResult = await this.generateImage(
      { ...params, userQuery: flyerPrompt },
      selectedStyle as any,
      userId,
      file,
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
    const style = params.style || workflowAnswers?.style || 'Modern';
    const promotion =
      workflowAnswers?.promotion && workflowAnswers.promotion !== 'Aucune'
        ? workflowAnswers.promotion
        : '';
    const tone = params.intention || workflowAnswers?.tone || 'Professional';

    // Include other workflow answers specifically
    const details = Object.entries(workflowAnswers || {})
      .filter(([key]) => !['type', 'style', 'promotion', 'tone'].includes(key))
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');

    return `A clean, professional commercial ${type} layout. ${style} graphic design, high-quality composition,
     perfect alignment, bold readable typography, centered title, ${tone} message.
     ${promotion ? `Promotional focus: ${promotion}.` : ''}
     ${details ? `Additional focus details: ${details}.` : ''}
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

  /* --------------------- AUDIO TRANSCRIPTION --------------------- */
  async transcribeAudio(file: Express.Multer.File): Promise<string> {
    const tempFilePath = path.join('/tmp', `audio_${Date.now()}.m4a`);
    try {
      fs.writeFileSync(tempFilePath, file.buffer);
      this.logger.log(
        `[transcribeAudio] File written to ${tempFilePath}, size: ${file.size}`,
      );

      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: 'whisper-1',
      });

      this.logger.log('[transcribeAudio] Transcription success');
      return transcription.text;
    } catch (e) {
      this.logger.error('Transcription failed', e);
      throw new BadRequestException('Failed to transcribe audio: ' + e.message);
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  }
}
