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

  private async saveGeneration(
    userId: number,
    result: string,
    prompt: string,
    type: string,
    attributes: any = {},
  ) {
    const generation = this.aiGenRepo.create({
      user: { id: userId } as AiUser,
      type: type as AiGenerationType,
      result,
      prompt: prompt.substring(0, 1000),
      title: (prompt || 'Untitled').substring(0, 30) + '...',
      attributes,
    });
    return await this.aiGenRepo.save(generation);
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
          throw new ForbiddenException('User not found');
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
      throw new Error(`AI Error: ${msg}`);
    }
  }

  /**
   * Refines a user's prompt into a single, high-quality descriptive sentence.
   * STRICTLY NO STYLE ADDITIONS - just better phrasing.
   */
  async refineText(text: string): Promise<string> {
    if (!text) return '';
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a professional editor. 
            Task: Rewrite the user's input into a SINGLE, CLEAR, high-quality sentence.
            Rules:
            1. Keep the original meaning exactly.
            2. Improve grammar, clarity, and flow.
            3. Do NOT add any artistic style (like "cinematic", "4k").
            4. Do NOT add any introduction or quotes.
            5. Output must be ONE sentence only.`,
          },
          {
            role: 'user',
            content: text,
          },
        ],
        temperature: 0.3,
        max_tokens: 150,
      });
      const refined = response.choices[0].message.content || text;
      return refined.trim().replace(/^"|"$/g, ''); // Remove quotes if present
    } catch (e) {
      this.logger.error(`[refineText] Failed: ${e.message}`);
      return text;
    }
  }

  /**
   * Refines a raw user query while PRESERVING all user information.
   * Enhances with aesthetic keywords without losing the original intent.
   * Critical: Every detail the user provides is captured and enriched.
   */

  async generateText(
    params: any,
    type: string,
    userId?: number,
  ): Promise<{ content: string; generationId?: number }> {
    if (typeof params === 'string') params = { userQuery: params };
    // Simplified inline prompt construction
    const { job, userQuery } = params;
    const basePrompt = `Job: ${job || 'Not specified'}\nRequest: ${userQuery || ''}`;

    const systemContext = `
Identity: Hipster IA
Role: Practical assistant for small businesses (restaurant, craftsman, coach)
Context: Generating ${type} content

REMEMBER: You're not a marketing creative from an agency, you help real people sell their things:
- A restaurant owner says "pizza promo" not "premium culinary innovation"
- A craftsman says "hiring" not "creative talent call"
- A coach says "motivation" not "aspirational premium content"
- Someone says "before after" not "documentary transformation"

CRITICAL RULES: 
1. Think like the USER (direct, simple, practical vocabulary)
2. NEVER invent information not provided
3. Speak simply, not like a marketing agency
4. Use words REAL PEOPLE would actually use
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
        title: (params.userQuery || 'Untitled').substring(0, 30) + '...',
        attributes: params,
      });
      generationId = saved.id;
    }

    return { content: result, generationId };
  }
  /* --------------------- IMAGE GENERATION --------------------- */

  async generateImage(
    params: {
      job?: string;
      function?: string;
      userQuery?: string;
      reference_image?: string;
      style?: string;
      type?: string;
    },
    style:
      | 'Premium'
      | 'Hero Studio'
      | 'Minimal Studio'
      | 'None'
      | '3d-model'
      | 'analog-film'
      | 'anime'
      | 'cinematic'
      | 'comic-book'
      | 'digital-art'
      | 'enhance'
      | 'fantasy-art'
      | 'isometric'
      | 'line-art'
      | 'low-poly'
      | 'modeling-compound'
      | 'neon-punk'
      | 'origami'
      | 'photographic'
      | 'pixel-art'
      | 'tile-texture',
    userId?: number,
    file?: Express.Multer.File,
    seed?: number,
  ) {
    this.logger.log(
      `[generateImage] START - Style: ${style}, UserId: ${userId}, Seed: ${seed}`,
    );

    if (userId) {
      await this.aiPaymentService.decrementCredits(
        userId,
        AiGenerationType.IMAGE,
      );
    }

    // ------------------------------------------------------------------
    // RANDOMIZATION POOLS
    // ------------------------------------------------------------------
    const getRandom = (arr: string[]) =>
      arr[Math.floor(Math.random() * arr.length)];
    const accentColors = ['red', 'orange', 'deep purple'];

    // Fetch user name for branding if needed
    let brandName = 'Premium';
    if (userId) {
      const userObj = await this.getAiUserWithProfile(userId);
      if (userObj) brandName = userObj.name || 'Premium';
    }

    // ------------------------------------------------------------------
    // QUERY REFORMULATION (Enhance user query while preserving all details)
    // ------------------------------------------------------------------
    const userQueryFull = [params.userQuery || '', params.job || '']
      .filter(Boolean)
      .join(' | ');

    const refinedQuery = userQueryFull;

    // ------------------------------------------------------------------
    // VISUAL DESCRIPTION GENERATION (Master Prompts)
    // ------------------------------------------------------------------
    let visualDescription = '';

    const negativePrompt = `
      text, typography, letters, words, numbers, watermarks, logos, signatures,
       AI artifacts, CGI, illustration, cartoon, anime, 3d render, plastic,
       blur, airbrush, smooth skin, doll-like, fake, oversaturated,
       extra limbs, unrealistic proportions, messy background,
       cheap decoration, cliché, low quality, hearts, balloons, cute,
       bad anatomy, bad hands, missing fingers, extra fingers, cropped, 
       out of frame, worst quality, jpeg artifacts, deformed, disfigured, 
       gross proportions, malformed limbs, missing arms, missing legs, 
       extra arms, extra legs, fused fingers, too many fingers, long neck, 
       plastic skin, smooth skin, neon, overly polished, denoised,
       grain, noise, blurry, hazy, low resolution, pixelated
    `.trim();

    const commonRealism = `
      ultra realistic photography, sharp focus, crystal clear details,
      real human skin texture, visible pores,
      fujifilm color science, kodak portra 400,
      micro-contrast, tactile textures,
      cinematic lighting, shot on Canon EOS R5, 85mm lens,
      high dynamic range, natural color grading, editorial quality,
      no beauty filter, no plastic skin, structural realism,
      8k resolution, highly detailed, perfect focus
    `;

    if (style === 'Premium') {
      visualDescription = `
        USER-PROVIDED DETAILS TO HONOR: ${refinedQuery}
        User's job: ${params.job || 'Not specified'}.
        
        STYLE: ULTRA HIGH CONTRAST BLACK & WHITE.
        Visual rules:
        1. STRICTLY BLACK AND WHITE. NO COLOR (except minimal ${getRandom(accentColors)} accent).
        2. Chiaroscuro lighting, deep shadows, dramatic silhouettes, rim lighting.
        3. Texture focus: skin pores, fabric weave, metal sheen, stone roughness (High Definition).
        4. Composition: Dynamic, asymmetrical, cinematic angles.
        
        Match the user's description exactly: ${params.userQuery || 'Professional context'}.
        Environmental context preserved: Follow user's location/setting exactly.
        
        Luxury branding aesthetic, premium campaign visual, high-end magazine quality, modern art direction.
        Large bold typography integrated into the composition featuring the name "${brandName}" — interacting with depth.
        Graphic design elements: thin geometric lines, subtle frame corners.
        The image must look like a real photograph, flawless professional quality, sharpest details.
      `.trim();
    } else if (style === 'Hero Studio') {
      visualDescription = `
        USER-PROVIDED DETAILS TO HONOR: ${refinedQuery}
        User's job: ${params.job || 'Not specified'}.
        Match the user's description exactly: ${params.userQuery || 'Professional context'}.
        
        STYLE: HERO STUDIO (DYNAMIC ACTION / BLOCKBUSTER).
        Visual rules:
        1. DYNAMIC ANGLES: Low angle, wide angle, dutch angle, motion blur on edges.
        2. DRAMATIC LIGHTING: Rim light, volumetric beams, lens flare, high contrast.
        3. COLOR GRADING: Teal & Orange, Cinematic Warm, Vibrant but realistic.
        4. TEXTURE: High fidelity textures, detailed fabric, realistic surfaces.
        
        Hero-style cinematic action shot representing ${params.job || 'professional activity'}.
        Powerful mid-movement pose, dramatic lighting, volumetric atmosphere.
        Environmental interaction, dynamic fashion campaign photography aesthetic.
        ${commonRealism}
        The image must look like a high-end commercial photograph, sharp focus.
      `.trim();
    } else if (style === 'Minimal Studio') {
      visualDescription = `
        USER-PROVIDED DETAILS TO HONOR: ${refinedQuery}
        User's job: ${params.job || 'Not specified'}.
        Match the user's description exactly: ${params.userQuery || 'Professional context'}.
        
        STYLE: MINIMAL STUDIO (CLEAN / SCANDINAVIAN).
        Visual rules:
        1. COMPOSITION: Negative space, center-weighted or rule of thirds, un-cluttered.
        2. LIGHTING: Soft diffused window light, lightbox style, no harsh shadows.
        3. COLORS: Pastels, neutrals, white, beige, desaturated tones.
        4. TEXTURE: Paper texture, linen, matte finish, ceramic, organic wood (Clean details).
        
        Minimal clean studio shot centered on ${params.job || 'professional item'}.
        Negative space composition, editorial minimal fashion aesthetic, soft diffused studio light.
        ${commonRealism}
        The image must look like a clean modern professional photograph, ultra sharp.
      `.trim();
    } else {
      visualDescription = `
        USER-PROVIDED DETAILS TO HONOR: ${refinedQuery}
        User's job: ${params.job || 'Not specified'}.
        Match the user's description exactly: ${params.userQuery || 'Professional context'}.
        Environmental context preserved: Follow user's location/setting exactly (do not invent or change scenes).
        
        Professional quality representation for ${params.job || 'business'} (${params.function || 'marketing'}).
        Subject details: ${refinedQuery || 'high-end professional representation'}.
        Style: ${style}.
        ${commonRealism}
      `.trim();
    }

    this.logger.log(
      `[generateImage] User Input Summary: userQuery=${params.userQuery}, job=${params.job}`,
    );
    this.logger.log(`[generateImage] Refined Query: ${refinedQuery}`);
    this.logger.log(`[generateImage] Style: ${style}`);
    this.logger.log(
      `[generateImage] Final Positive Prompt: ${visualDescription}`,
    );
    this.logger.log(`[generateImage] Final Negative Prompt: ${negativePrompt}`);

    // ------------------------------------------------------------------
    // CALL STABILITY.AI API (Plan-based Endpoint selection)
    // ------------------------------------------------------------------
    const apiKey =
      this.configService.get('STABLE_API_KEY') ||
      this.configService.get('STABILITY_API_KEY');
    if (!apiKey) throw new Error('Missing STABILITY API KEY');

    // Fetch user plan to select endpoint
    let userPlan = PlanType.CURIEUX;
    if (userId) {
      const user = await this.aiUserRepo.findOne({ where: { id: userId } });
      if (user) userPlan = user.planType || PlanType.CURIEUX;
    }

    let endpoint =
      'https://api.stability.ai/v2beta/stable-image/generate/ultra';
    const outputFormat = 'png';
    let useModelParam = true;
    let useNegativePrompt = true;

    this.logger.log(
      `[generateImage] Using Plan: ${userPlan} -> Endpoint: ${endpoint}`,
    );

    // ------------------------------------------------------------------
    // Stability AI Style Presets Mapping
    // ------------------------------------------------------------------
    const STABILITY_PRESETS = [
      '3d-model',
      'analog-film',
      'anime',
      'cinematic',
      'comic-book',
      'digital-art',
      'enhance',
      'fantasy-art',
      'isometric',
      'line-art',
      'low-poly',
      'modeling-compound',
      'neon-punk',
      'origami',
      'photographic',
      'pixel-art',
      'tile-texture',
    ];

    let stylePreset = 'none';
    const styleLower = style.toLowerCase().replace(/\s+/g, '-');

    if (STABILITY_PRESETS.includes(styleLower)) {
      stylePreset = styleLower;
    } else if (
      style === 'Hero Studio' ||
      style === 'Minimal Studio' ||
      style === 'Premium'
    ) {
      stylePreset = 'photographic';
    } else if (style === 'None') {
      stylePreset = 'none';
    }

    if (params.style && STABILITY_PRESETS.includes(params.style)) {
      stylePreset = params.style;
    }

    const formData = new FormData();
    formData.append('prompt', visualDescription);
    if (useNegativePrompt && negativePrompt) {
      formData.append('negative_prompt', negativePrompt);
    }
    formData.append('output_format', outputFormat);

    // Pass Seed if provided
    if (seed) {
      formData.append('seed', seed.toString());
    }

    // Dynamic Aspect Ratio
    let aspectRatio = '1:1';

    if (params.function) {
      const funcLower = params.function.toLowerCase();
      if (
        funcLower.includes('publicitaire') ||
        funcLower.includes('advertising')
      ) {
        aspectRatio = '4:5';
      } else if (
        funcLower.includes('réseaux') ||
        funcLower.includes('social') ||
        funcLower.includes('story')
      ) {
        aspectRatio = '9:16';
      }
    }
    this.logger.log(`[generateImage] Aspect Ratio: ${aspectRatio}`);
    formData.append('aspect_ratio', aspectRatio);
    if (stylePreset && stylePreset !== 'none') {
      formData.append('style_preset', stylePreset);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    this.logger.log(
      `[generateImage] Calling Stability AI: ${endpoint} (Model: ${useModelParam})`,
    );

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
        this.logger.error(
          `[generateImage] Stability AI error: ${response.status} - ${err}`,
        );
        throw new Error(`Stability AI failed: ${response.status} - ${err}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const uploadDir = path.join(process.cwd(), 'uploads', 'ai-generations');
      if (!fs.existsSync(uploadDir))
        fs.mkdirSync(uploadDir, { recursive: true });

      const fileName = `gen_${Date.now()}_${crypto.randomBytes(5).toString('hex')}.${outputFormat}`;
      const filePath = path.join(uploadDir, fileName);

      fs.writeFileSync(filePath, buffer);

      const publicUrl = `https://hipster-api.fr/uploads/ai-generations/${fileName}`;
      this.logger.log(`[generateImage] SUCCESS - Image saved: ${fileName}`);

      // Capture Seed from Header
      const stabilitySeed =
        response.headers.get('seed') ||
        response.headers.get('stability-seed') ||
        seed?.toString() ||
        '0';

      // Save to DB (Restore this logical step)
      let genId = null;
      if (userId) {
        const saved = await this.saveGeneration(
          userId,
          publicUrl,
          params.userQuery || 'Image generated',
          'image',
        );
        genId = saved.id;
      }

      return {
        url: publicUrl,
        generationId: genId,
        seed: parseInt(stabilitySeed),
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

    // Get style
    const selectedStyle = params.style || 'Minimal Studio';
    this.logger.log(`[generateSocial] Selected style: ${selectedStyle}`);

    // Only generate image, no text per user request
    const imageRes = await this.generateImage(
      { ...params, instructions: 'Image for social media' },
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
    // Simplified inline prompt construction
    const { job, userQuery } = params;
    const baseContext = `Job: ${job || 'Not specified'}\nRequest: ${userQuery || ''}`;
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
    if (!generation) throw new Error('Document not found');

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
        throw new Error('Unsupported format');
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
    return { title: 'Document', sections: [{ title: 'Content', text }] };
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

    // Get style
    const selectedStyle = params.style || 'Minimal Studio';
    this.logger.log(`[generateFlyer] Selected style: ${selectedStyle}`);

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
    const { userQuery, title, businessName } = params;
    const userText = this.cleanUserPrompt(
      userQuery || title || businessName || 'Promotion',
    );

    const style = params.style || 'Modern';

    return `A simple pro Flyer, ${style}, well-organized, readable, not cluttered.
     Main text clearly visible and correct: "${userText}".
      Tone: Professional.
     Use a real Flyer layout (not mockup). Clear colors, good contrast, white space.
     Feels like something you'd actually see at a real business.
     Good resolution, readable.`.replace(/\s+/g, ' ');
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
