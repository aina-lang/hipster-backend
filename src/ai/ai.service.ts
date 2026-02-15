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
        'prompt',
        'result',
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

  async chat(
    messages: any[],
    userId?: number,
    conversationId?: string | number,
    isUsageLog: boolean = false,
  ): Promise<{
    content: string;
    conversationId?: string;
    type?: string;
    mediaUrl?: string;
  }> {
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
      }

      // 1. Orchestrate intent
      const lastUserMsg = [...messages]
        .reverse()
        .find((m) => m.role === 'user');
      const orchestration = await this.orchestrateChat(
        lastUserMsg?.content || '',
        messages,
      );

      this.logger.log(
        `[orchestrateChat] Intent: ${JSON.stringify(orchestration)}`,
      );

      let responseContent = '';
      let mediaUrl = '';
      let type = 'text';

      // 2. Generate content based on intent
      if (orchestration.generateImage) {
        const imgRes = await this.generateImage(
          { userQuery: orchestration.imagePrompt || lastUserMsg?.content },
          'photographic',
          userId,
        );
        mediaUrl = imgRes.url;
        type = 'image';
      } else if (orchestration.generateVideo) {
        const vidRes = await this.generateVideo(
          { userQuery: orchestration.videoPrompt || lastUserMsg?.content },
          userId,
        );
        mediaUrl = vidRes.url;
        type = 'video';
      } else if (orchestration.generateAudio) {
        const audRes = await this.generateAudio(
          { userQuery: orchestration.audioPrompt || lastUserMsg?.content },
          userId,
        );
        mediaUrl = audRes.url;
        type = 'audio';
      }

      // Always generate text if requested or as a description of media
      if (orchestration.generateText || !mediaUrl) {
        // Add context for text generation if we have media
        const textMessages = [...messages];
        if (mediaUrl) {
          textMessages.push({
            role: 'system',
            content: `Tu viens de générer un(e) ${type}. Explique brièvement ce que tu as fait en rapport avec la demande de l'utilisateur.`,
          });
        }

        const completion = await this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: textMessages,
        });
        responseContent = completion.choices[0].message.content || '';
      }

      let generationId: string | undefined;

      if (userId) {
        // Decrease credits for the main intent
        const creditType = orchestration.generateImage
          ? AiGenerationType.IMAGE
          : orchestration.generateVideo
            ? AiGenerationType.VIDEO
            : orchestration.generateAudio
              ? AiGenerationType.AUDIO
              : AiGenerationType.TEXT;

        await this.aiPaymentService.decrementCredits(userId, creditType);

        let generation: AiGeneration;

        // Normalize conversationId
        const cid =
          conversationId &&
          conversationId !== 'null' &&
          conversationId !== 'undefined'
            ? parseInt(conversationId.toString())
            : null;

        if (cid) {
          generation = await this.aiGenRepo.findOne({
            where: { id: cid, user: { id: userId } },
          });

          if (generation) {
            generation.result = responseContent;
            generation.prompt = JSON.stringify(messages);
            generation.createdAt = new Date();
            await this.aiGenRepo.save(generation);
          }
        }

        if (!generation) {
          const firstUserMsg = messages.find((m) => m.role === 'user');
          generation = await this.aiGenRepo.save({
            user: { id: userId } as AiUser,
            type: AiGenerationType.CHAT,
            prompt: JSON.stringify(messages),
            result: responseContent,
            attributes: isUsageLog ? { isUsageLog: true } : {},
            title:
              (firstUserMsg?.content?.substring(0, 50) || 'Conversation') +
              '...',
          });
        }

        generationId = generation.id.toString();

        if (!isUsageLog) {
          await this.aiGenRepo.save({
            user: { id: userId } as AiUser,
            type: AiGenerationType.TEXT,
            prompt: lastUserMsg?.content || 'Chat message',
            result: responseContent,
            attributes: {
              isUsageLog: true,
              conversationId: generation.id,
              mediaUrl,
              mediaType: type,
            },
          });
        }
      }

      return {
        content: responseContent,
        conversationId: generationId,
        type: mediaUrl ? type : 'text',
        mediaUrl,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`AI Error: ${msg}`);
    }
  }

  private async orchestrateChat(
    userQuery: string,
    history: any[],
  ): Promise<{
    generateImage: boolean;
    generateVideo: boolean;
    generateAudio: boolean;
    generateText: boolean;
    imagePrompt?: string;
    videoPrompt?: string;
    audioPrompt?: string;
    explanationNeeded?: boolean;
  }> {
    const systemPrompt = `
    You are the Brain Orchestrator for Hipster IA Free Mode.
    Analyze the user's latest query and the conversation history to determine their intent.

    Intents:
    - IMAGE: User wants to generate an image (e.g., "dessine/génère une image de...", "crée un logo...").
    - VIDEO: User wants to generate a short video (e.g., "fais une vidéo de...", "anime ça...").
    - AUDIO: User wants to generate audio/speech (e.g., "dis...", "lis ça...", "voix off...").
    - TEXT: Default assistant chat or request for writing only.

    CRITICAL: 
    - Respond ONLY with JSON.
    - imagePrompt should be in ENGLISH, high quality.
    - Default generateText to true if you need to explain or respond.

    {
      "generateImage": boolean,
      "generateVideo": boolean,
      "generateAudio": boolean,
      "generateText": boolean,
      "imagePrompt": string (if image),
      "videoPrompt": string (if video),
      "audioPrompt": string (if audio)
    }
    `;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.slice(-5), // last few turns for context
          { role: 'user', content: userQuery },
        ],
        response_format: { type: 'json_object' },
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (e) {
      this.logger.error('Orchestration error:', e);
      return {
        generateImage: false,
        generateVideo: false,
        generateAudio: false,
        generateText: true,
      };
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
            5. Output must be ONE sentence only.
            6. STRICTLY PLAIN TEXT: NEVER use markdown (no **, no #).`,
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
    if (typeof params === 'string') {
      try {
        params = JSON.parse(params);
      } catch (e) {
        params = { userQuery: params };
      }
    }

    const { job, userQuery } = params;
    const basePrompt = `Job: ${job || 'Not specified'}\nRequest: ${userQuery || ''}`;

    let brandingContext = '';
    if (userId) {
      const u = await this.getAiUserWithProfile(userId);
      if (u) {
        const fields = [];
        if (u.name) fields.push(`- Nom de l'entreprise/utilisateur: ${u.name}`);
        if (u.professionalEmail)
          fields.push(`- Email pro: ${u.professionalEmail}`);
        const fullAddress = [u.professionalAddress, u.city]
          .filter(Boolean)
          .join(' ');
        if (fullAddress) fields.push(`- Adresse: ${fullAddress}`);
        if (u.professionalPhone)
          fields.push(`- Téléphone: ${u.professionalPhone}`);
        if (u.websiteUrl) fields.push(`- Site Web: ${u.websiteUrl}`);

        if (fields.length > 0) {
          brandingContext = `USER PROFILE (IMPORTANT: Use these ONLY if relevant):\n${fields.join('\n')}`;
        }
      }
    }

    const systemPrompt = `
Identity: Hipster IA
Role: Practical assistant for small businesses (restaurant, craftsman, coach)
Context: Generating ${type} content

${brandingContext}

REMEMBER: You're not a marketing creative from an agency, you help real people sell their things:
- A restaurant owner says "pizza promo" not "premium culinary innovation"
- A craftsman says "hiring" not "creative talent call"
- A coach says "motivation" not "aspirational premium content"
- Someone says "before after" not "documentary transformation"

CRITICAL RULES: 
1. Think like the USER (direct, simple, practical vocabulary)
2. NEVER invent information and NEVER use placeholders like "[votre numéro]" or "[votre adresse]".
3. If a specific piece of information (phone, address, name) is not present in the USER PROFILE provided below, DO NOT mention it in the generated text.
4. Speak simply, not like a marketing agency.
5. Use words REAL PEOPLE would actually use.
6. STRICTLY PLAIN TEXT: NEVER use markdown formatting (no bold **, no italics *, no lists #, no links). Just pure text.
7. INTEGRATE the USER'S NAME, PHONE, or ADDRESS naturally ONLY if they are available in the PROFILE.
`;

    const messages = [
      { role: 'system', content: systemPrompt },
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
      strength?: number;
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

    let refinedQuery = userQueryFull;

    // If user query is empty, provide a descriptive base for the chosen job
    if (!params.userQuery?.trim() && params.job) {
      refinedQuery = `A professional high-end cinematic scene representing the activity of ${params.job}. The image should showcase the professional environment, authentic tools of the trade, and a premium business atmosphere, highly detailed.`;
    }

    // ------------------------------------------------------------------
    // VISUAL DESCRIPTION GENERATION (Master Prompts)
    // ------------------------------------------------------------------
    let visualDescription = '';

    let negativePrompt = `
      text, letters, words, typography, numbers, labels, quotes, heading, 
      advertising text, banner, caption, message, script,
      watermarks, logos, signatures,
      AI artifacts, CGI, illustration, cartoon, anime, 3d render, plastic,
      blur, airbrush, smooth skin, doll-like, fake, oversaturated,
      extra limbs, unrealistic proportions, messy background,
      cheap decoration, cliché, low quality, hearts, balloons, cute,
      bad anatomy, bad hands, missing fingers, extra fingers, cropped, 
      out of frame, worst quality, jpeg artifacts, deformed, disfigured, 
      gross proportions, malformed limbs, missing arms, missing legs, 
      extra arms, extra legs, fused fingers, too many fingers, long neck, 
      plastic skin, smooth skin, neon, overly polished, denoised,
      grain, noise, blurry, hazy, low resolution, pixelated,
      fused hands, malformed hands, missing digits, extra digits, 
      cloned faces, weird eyes, deformed iris, uncanny valley,
      oversmoothed, plastic face, mutation, mutilated, cloned objects
    `.trim();

    // ------------------------------------------------------------------
    // DYNAMIC NEGATIVE PROMPT ADJUSTMENT
    // ------------------------------------------------------------------
    const currentStyleLower = style.toLowerCase();
    const funcLower = (params.function || '').toLowerCase();

    // If style is 3D, remove 3D-related blocks from negative
    if (
      currentStyleLower.includes('3d') ||
      currentStyleLower.includes('modeling')
    ) {
      negativePrompt = negativePrompt
        .replace(/3d render, plastic,/i, '')
        .replace(/CGI,/i, '');
    }

    // If style is Anime, remove anime/illustration blocks
    if (
      currentStyleLower.includes('anime') ||
      currentStyleLower.includes('comic')
    ) {
      negativePrompt = negativePrompt
        .replace(/illustration, cartoon, anime,/i, '')
        .replace(/CGI,/i, '');
    }

    // If function is advertising/publicitaire, loosen text restrictions
    // (Stability AI isn't great at text, but banning it entirely breaks layout)
    if (funcLower.includes('publicitaire') || funcLower.includes('ads')) {
      negativePrompt = negativePrompt
        .replace(
          /text, letters, words, typography, numbers, labels, quotes, heading,/i,
          '',
        )
        .replace(/advertising text, banner, caption, message, script,/i, '');
    }

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
    // if (file) {
    //   endpoint =
    //     'https://api.stability.ai/v2beta/stable-image/generate/image-to-image';
    // }
    const outputFormat = 'png';
    let useModelParam = !file; // Ultra doesn't take model, but structure might
    let useNegativePrompt = !file; // Control APIs usually don't take negative_prompt the same way

    this.logger.log(
      `[generateImage] Using Plan: ${userPlan} -> Endpoint: ${endpoint} (HasFile: ${!!file})`,
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

    // Finalize multipart if file exists
    if (file) {
      formData.append(
        'image',
        new Blob([file.buffer as any], { type: file.mimetype }),
        file.originalname,
      );
      // Image-to-image strength (0.0 to 1.0)
      // 0 = original, 1 = totally new
      const strengthVal = params.strength !== undefined ? params.strength : 0.5;
      formData.append('strength', strengthVal.toString());
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

  /* --------------------- SOCIAL POSTS (ORCHESTRATED) --------------------- */
  /**
   * Main entry point for Social Posts.
   * This method uses an AI Orchestrator to decide what to generate based on a single user input.
   */
  async generateSocial(
    params: any,
    userId?: number,
    file?: Express.Multer.File,
    seed?: number,
  ) {
    if (typeof params === 'string') params = { userQuery: params };

    const selectedStyle = params.style || 'Minimal Studio';
    this.logger.log(`[generateSocial] START - Style: ${selectedStyle}`);

    // Fetch user profile for orchestration context
    let brandingContext = '';
    if (userId) {
      const u = await this.getAiUserWithProfile(userId);
      if (u) {
        const fields = [];
        if (u.name) fields.push(`- Nom: ${u.name}`);
        if (u.job || params.job)
          fields.push(`- Métier: ${u.job || params.job}`);
        if (u.professionalEmail) fields.push(`- Email: ${u.professionalEmail}`);
        if (u.professionalPhone)
          fields.push(`- Téléphone: ${u.professionalPhone}`);
        if (u.professionalAddress)
          fields.push(`- Adresse: ${u.professionalAddress}`);
        if (u.city) fields.push(`- Ville: ${u.city}`);
        if (u.websiteUrl) fields.push(`- Site web: ${u.websiteUrl}`);
        brandingContext = fields.join('\n');
      }
    }

    // Orchestrate: Split user query into specific instructions for Image and Text
    // This allows a single text field to handle "I want an image of X" or "Write a post about Y" or both.
    const productionContext = `Format: ${params.function || 'General'}`;
    const orchestration = await this.orchestrateSocial(
      params.userQuery,
      brandingContext,
      productionContext,
    );
    this.logger.log(
      `[generateSocial] Orchestration result: ${JSON.stringify(orchestration)}`,
    );

    let imageRes: {
      url: string | null;
      generationId?: number | null;
      seed?: number;
    } = { url: null, generationId: null };
    let textRes: { content: string | null; generationId?: number | null } = {
      content: null,
      generationId: null,
    };

    // 1. Generate Image if orchestrator decided it's needed
    if (orchestration.generateImage) {
      imageRes = await this.generateImage(
        { ...params, userQuery: orchestration.imagePrompt },
        selectedStyle as any,
        userId,
        file,
        seed,
      );
    }

    // 2. Process final text generation results
    if (orchestration.generateText && orchestration.captionText) {
      textRes.content = orchestration.captionText;

      // Save the text generation as a separate log for history/credits tracking
      if (userId) {
        const savedText = await this.aiGenRepo.save({
          user: { id: userId } as AiUser,
          type: AiGenerationType.TEXT,
          prompt: `Orchestrated: ${params.userQuery}`.substring(0, 1000),
          result: orchestration.captionText,
          title: `Post: ${(params.userQuery || '').substring(0, 20)}...`,
          attributes: { ...params, orchestrated: true },
        });
        textRes.generationId = savedText.id;
      }
    }

    return {
      content: textRes.content,
      url: imageRes.url,
      generationId: imageRes.generationId || textRes.generationId,
      seed: imageRes.seed,
      orchestration, // Metadata for transparency
    };
  }

  /**
   * Orchestrates social media content by splitting a single user request into
   * specific instructions for the image generation engine and the text generation engine.
   * It handles cases where user only wants an image, only text, or both.
   */
  private async orchestrateSocial(
    userQuery: string,
    brandingContext: string,
    productionContext: string = 'General',
  ): Promise<{
    generateImage: boolean;
    generateText: boolean;
    imagePrompt: string;
    captionText: string;
  }> {
    const systemPrompt = `
You are the Brain Orchestrator for Hipster IA. The user has only ONE text field to express their needs.
Your job is to parse this single 'userQuery' and determine:
1. Does the user want an image? (generateImage)
2. Does the user want a text caption? (generateText)
3. If yes to image: What is the specific prompt for the IMAGE engine (in ENGLISH, photorealistic, no text)? (imagePrompt)
4. If yes to text: Generate the FINAL marketing text for the user (in FRENCH). (captionText)

USER CONTEXT:
${brandingContext}

PRODUCTION CONTEXT:
${productionContext}

WRITING STYLE (HIPSTER IA IDENTITY):
- Practical assistant for small businesses.
- NOT a marketing agency: use simple, direct, practical vocabulary.
- A restaurant owner says "pizza promo" not "premium culinary innovation".
- CRITICAL: NO Markdown formatting (no **, no #). Strictly plain text.
- CRITICAL: NEVER use placeholders like "[votre numéro]" or "[votre adresse]".
- ONLY mention phone, address, or name if they are explicitly present in the USER CONTEXT. If missing, ignore them.

DECISION LOGIC:
- If userQuery describes a visual scene, set generateImage: true.
- If userQuery asks to write something, set generateText: true.
- Default to both: true if ambiguous.
- IMAGE_PROMPT MUST BE IN ENGLISH.
- CAPTION_TEXT MUST BE IN FRENCH.
- CONTACT INFO: Use the provided phone, address, or email ONLY if the user explicitly asks for contact info (e.g., "ajoute mes coordonnées", "donne mon numéro", "précise mon adresse") or if it's strictly necessary for a conversion-focused post (e.g., "appelle-nous au..."). If not explicitly requested, prioritize a clean marketing message without contact clutter.

Respond ONLY with a valid JSON object using camelCase keys: generateImage, generateText, imagePrompt, captionText.
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: userQuery || 'Crée un post pour mon activité',
          },
        ],
        response_format: { type: 'json_object' },
      });

      return JSON.parse(response.choices[0].message.content) as any;
    } catch (e) {
      this.logger.error(
        '[orchestrateSocial] Orchestration failed, using fallback',
        e,
      );
      return {
        generateImage: true,
        generateText: true,
        imagePrompt: userQuery,
        captionText: userQuery,
      };
    }
  }

  /* --------------------- DOCUMENTS --------------------- */
  async generateDocument(
    type: 'legal' | 'business',
    params: any,
    userId?: number,
  ) {
    return await this.generateText(params, type, userId);
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
    seed?: number,
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
      seed,
    );

    return {
      url: imageResult.url,
      imageData: imageResult.url, // For compatibility with controller destructuring
      generationId: imageResult.generationId,
      seed: imageResult.seed,
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
    return `text, letters, words, typography, labels, heading, banner, caption, 
    blurry text, distorted letters, gibberish, misspelled words, broken text, messy layout, 
    random symbols, fake language, poster mockup, watermark, low contrast, over-saturated colors, 
    chaotic design, noise, low resolution`.replace(/\s+/g, ' ');
  }

  async applyWatermark(url: string, isPremium: boolean): Promise<string> {
    // Simply returning the URL for now as requested or to simplify
    return url;
  }

  /* --------------------- VIDEO & AUDIO --------------------- */
  async generateVideo(params: any, userId?: number, seed?: number) {
    this.logger.log(`[generateVideo] START - UserId: ${userId}`);

    if (userId) {
      await this.aiPaymentService.decrementCredits(
        userId,
        AiGenerationType.VIDEO,
      );
    }

    // Since Stability AI Video requires an init image, we'll first generate an image
    // then use it to generate a video. For this "reappearance" task, we'll implement
    // a mock or a simple flow if image exists.

    let imageUrl = params.reference_image;
    if (!imageUrl) {
      const imgRes = await this.generateImage(
        params,
        'photographic',
        userId,
        undefined,
        seed,
      );
      imageUrl = imgRes.url;
    }

    // Mocking video generation for now as requested to "reappear"
    const mockVideoUrl =
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

    let genId = null;
    if (userId) {
      const saved = await this.saveGeneration(
        userId,
        mockVideoUrl,
        params.userQuery || 'Video generated',
        'video',
      );
      genId = saved.id;
    }

    return {
      url: mockVideoUrl,
      generationId: genId,
      seed: seed || 0,
    };
  }

  async generateAudio(params: any, userId?: number, seed?: number) {
    this.logger.log(`[generateAudio] START - UserId: ${userId}`);

    if (userId) {
      await this.aiPaymentService.decrementCredits(
        userId,
        AiGenerationType.AUDIO,
      );
    }

    const userQuery = params.userQuery || 'Hello, I am Hipster IA.';
    const mp3 = await this.openai.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy',
      input: userQuery,
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    const uploadDir = path.join(process.cwd(), 'uploads', 'ai-generations');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const fileName = `audio_${Date.now()}_${crypto.randomBytes(5).toString('hex')}.mp3`;
    const filePath = path.join(uploadDir, fileName);
    fs.writeFileSync(filePath, buffer);

    const publicUrl = `https://hipster-api.fr/uploads/ai-generations/${fileName}`;

    let genId = null;
    if (userId) {
      const saved = await this.saveGeneration(
        userId,
        publicUrl,
        userQuery,
        'audio',
      );
      genId = saved.id;
    }

    return {
      content: publicUrl,
      url: publicUrl,
      generationId: genId,
    };
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
