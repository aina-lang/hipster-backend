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
    params: any,
    style: 'Monochrome' | 'Hero Studio' | 'Minimal Studio',
    userId?: number,
    file?: Express.Multer.File,
  ) {
    if (userId)
      await this.aiPaymentService.decrementCredits(
        userId,
        AiGenerationType.IMAGE,
      );

    if (typeof params === 'string') params = { userQuery: params };
    const basePrompt = await this.buildPrompt(params, userId);

    // Default prompt from user query
    let visualDescription = params.userQuery || '';

    // Base realism quality prompts from user
    const realismQuality = `ultra realistic photography, real human skin texture, visible pores, natural skin imperfections, subtle asymmetry, natural facial features, cinematic lighting, 35mm photography, shot on Canon EOS R5, professional studio photography, high dynamic range, fine skin details, natural color grading, editorial fashion photography, no beauty filter, no plastic skin`;

    const realismNegative = `text, typography, watermark, logo, letters, words, brand, label, sign, signature, overly smooth skin, plastic skin, cgi look, 3d render, cartoon, illustration, perfect symmetry, ai face, fake face, blurred face, low detail skin`;

    const referenceImage = params.reference_image;
    let negativePrompt = realismNegative;

    const jobSubject = params.job?.trim();
    const querySubject = params.userQuery?.trim();

    // If we have a reference image, the subject is the person/thing in that image.
    // We shouldn't use the user's query (which often contains style instructions) as the subject name.
    const userSubject = referenceImage
      ? jobSubject || 'subject'
      : querySubject && querySubject.length > 0
        ? querySubject
        : jobSubject && jobSubject.length > 0
          ? jobSubject
          : 'portrait';

    // Photographic Randomization Pools
    const lightingPool = [
      'side lighting dramatic',
      'top light cinematic',
      'rim light silhouette',
      'split lighting high contrast',
      'soft diffused studio light',
      'volumetric lighting',
      'dramatic butterfly lighting',
    ];
    const anglesPool = [
      'slight low angle',
      'slight high angle',
      'profile view',
      'three quarter view',
      'centered frontal portrait',
      'eye-level close-up',
    ];
    const backgroundsPool = [
      'textured dark concrete background',
      'minimal white seamless studio',
      'grainy film texture',
      'matte charcoal backdrop',
      'soft gradient grey background',
      'abstract blurred architectural space',
      'clean light grey professional studio',
    ];
    const accentColors = [
      'deep red',
      'burnt orange',
      'electric purple',
      'muted gold',
      'vibrant cyan',
    ];

    const getRandom = (arr: string[]) =>
      arr[Math.floor(Math.random() * arr.length)];

    const light = getRandom(lightingPool);
    const angle = getRandom(anglesPool);
    const bg = getRandom(backgroundsPool);
    const accent = getRandom(accentColors);

    const identityPreservation = referenceImage
      ? ', (preserve EXACT facial features and identity:1.0), (exact resemblance to the provided image:1.0)'
      : '';

    // --- MONOCHROME PROMPT LOGIC ---
    if (style === 'Monochrome') {
      const isModification = !!referenceImage && !params.search_prompt;
      const transformPrefix = isModification
        ? `Clean monochrome black and white photography background, professional studio setting, minimalist concrete texture, ${bg}, dramatic lighting.`
        : `Professional monochrome photography of ${userSubject}, ultra high contrast black and white, dramatic cinematic lighting (${light}), deep shadows, sharp facial details, subject centered, minimal clean background (${bg})${identityPreservation}.`;

      visualDescription = isModification
        ? transformPrefix
        : `
${transformPrefix}
Angle: ${angle}.

Graphic design elements: subtle geometric lines, minimalist composition, modern aesthetic.
(Optional: one subtle accent color (${accent}) used in tiny geometric highlights).

Luxury campaign aesthetic, sharp focus, ultra clean, professional studio lighting.
`.trim();

      this.logger.log(
        `[Monochrome] Generated prompt (${visualDescription.length} chars): ${visualDescription}`,
      );

      // Force specific negative prompt for Monochrome
      negativePrompt =
        'color, colorful, red, blue, green, yellow, orange, purple, pink, low quality, blurry, oversaturated, messy background, bad typography, watermark, logo, distorted face, extra fingers, extra limbs, bad anatomy, low resolution, text errors, random letters, flat lighting, amateur photography, ' +
        realismNegative;
    }

    this.logger.log(
      `[generateImage] Style processing complete. Style Preset: ${params.style_preset || 'random'}`,
    );

    // Determine style preset for Stability AI
    let stylePreset: string | undefined = params.style_preset;
    if (!stylePreset) {
      if (style === 'Monochrome') stylePreset = 'analog-film';
      else if (style === 'Hero Studio') stylePreset = 'photographic';
      else if (style === 'Minimal Studio') stylePreset = 'photographic';
      else {
        const presets = ['photographic', 'analog-film', 'cinematic', 'enhance'];
        stylePreset = getRandom(presets);
      }
    }

    // --- HERO STUDIO PROMPT LOGIC ---
    if (style === 'Hero Studio') {
      const isModification = !!referenceImage && !params.search_prompt;
      visualDescription = isModification
        ? `Professional studio background for a luxury product/person shot, ${bg}, cinematic rim lighting, volumetric light rays, deep shadows, high-end commercial aesthetic, 8k resolution.`
        : `
Professional studio photography of ${userSubject}, iconic product shot, dramatic lighting (${light}), high contrast, strong visual impact, "wow" effect${identityPreservation}.
Centered composition, angle (${angle}), sharp focus on the subject, premium aesthetic, commercial photography, 8k resolution, highly detailed.
Lighting: Volumetric lighting, rim light, highlighting textures and details.
Background: ${bg}, depth of field.

${realismQuality}
`.trim();
      this.logger.log(`[Hero Studio] Generated prompt: ${visualDescription}`);
    }

    // --- MINIMAL STUDIO PROMPT LOGIC ---
    if (style === 'Minimal Studio') {
      const isModification = !!referenceImage && !params.search_prompt;
      visualDescription = isModification
        ? `Clean minimalist studio background, bright and airy, soft diffused light, ${bg}, pastel tones, professional e-commerce style, negative space, clean aesthetic.`
        : `
Minimalist studio photography of ${userSubject}, bright and airy, soft diffused lighting (${light}), white or light neutral background (${bg})${identityPreservation}.
Clean composition, angle (${angle}), plenty of negative space, modern aesthetic, high-end look, ultra readable.
Soft shadows, pastel tones (optional), sharp details, professional e-commerce style.

${realismQuality}
`.trim();
      this.logger.log(
        `[Minimal Studio] Generated prompt: ${visualDescription}`,
      );
    }

    // Final safety check for empty prompt
    if (!visualDescription || visualDescription.length === 0) {
      this.logger.warn('[generateImage] Prompt is empty, using fallback.');
      visualDescription = 'Artistic abstract composition, high quality, 8k';
    }

    const apiKey =
      this.configService.get<string>('STABLE_API_KEY') ||
      this.configService.get<string>('STABILITY_API_KEY');
    if (!apiKey) throw new Error('Configuration manquante : STABLE_API_KEY');

    this.logger.log(
      `[generateImage] Stability AI check. Style: ${style || 'default'}, ReferenceImage present: ${!!referenceImage}`,
    );

    // Determine Model & Endpoint based on Plan & Request
    let endpoint = 'https://api.stability.ai/v2beta/stable-image/generate/core';
    let model: string | undefined = undefined;
    let outputFormat = 'png';

    const isSearchAndReplace = !!(referenceImage && params.search_prompt);

    if (isSearchAndReplace) {
      // Use Search and Replace for targeted edits
      endpoint =
        'https://api.stability.ai/v2beta/stable-image/edit/search-and-replace';
    } else if (referenceImage) {
      // SPECIALIZED: Use Replace Background to preserve subject and change world
      endpoint =
        'https://api.stability.ai/v2beta/stable-image/edit/replace-background';
    } else if (userId) {
      const userProfile = await this.getAiUserWithProfile(userId);
      const plan = userProfile?.planType || PlanType.CURIEUX;

      if (plan === PlanType.STUDIO) {
        // Studio -> SD 3.5 Large Turbo
        endpoint = 'https://api.stability.ai/v2beta/stable-image/generate/sd3';
        model = 'sd3.5-large-turbo';
      } else if (plan === PlanType.AGENCE) {
        // Agence -> Ultra
        endpoint =
          'https://api.stability.ai/v2beta/stable-image/generate/ultra';
      }
    }

    const formData = new FormData();
    formData.append('prompt', visualDescription);
    if (negativePrompt) formData.append('negative_prompt', negativePrompt);
    formData.append('output_format', outputFormat);

    if (stylePreset) {
      formData.append('style_preset', stylePreset);
    }

    // Common optional parameter: seed
    if (params.seed) {
      formData.append('seed', params.seed.toString());
    }

    if (file || referenceImage) {
      // Handle Image-to-Image (Search and Replace)
      let imageBuffer: Buffer;
      let mimeType: string | undefined = undefined;
      let extension = 'png';

      if (file) {
        imageBuffer = file.buffer;
        mimeType = file.mimetype;
        extension = file.originalname.split('.').pop() || 'png';
      } else {
        // Fallback to base64 for legacy or if no file provided
        const cleanBase64 = referenceImage
          .replace(/^data:image\/\w+;base64,/, '')
          .replace(/\s/g, '');
        imageBuffer = Buffer.from(cleanBase64, 'base64');
      }

      // Detect MIME type from magic bytes if not already set or generic
      if (imageBuffer.length > 4) {
        const hex = imageBuffer.slice(0, 4).toString('hex');
        if (
          hex.startsWith('89504e47') &&
          (!mimeType || mimeType === 'application/octet-stream')
        ) {
          mimeType = 'image/png';
          extension = 'png';
        } else if (
          hex.startsWith('ffd8ff') &&
          (!mimeType || mimeType === 'application/octet-stream')
        ) {
          mimeType = 'image/jpeg';
          extension = 'jpg';
        } else if (
          imageBuffer.slice(0, 4).toString() === 'RIFF' &&
          (!mimeType || mimeType === 'application/octet-stream')
        ) {
          mimeType = 'image/webp';
          extension = 'webp';
        }
      }

      const finalMime = mimeType || 'image/png';

      this.logger.log(
        `Processing image: ${finalMime} (${imageBuffer.length} bytes), Source: ${file ? 'Multipart' : 'Base64'}`,
      );

      // Append as blob for multipart form with detected type
      formData.append(
        'image',
        new Blob([imageBuffer as any], { type: finalMime }),
        `input.${extension}`,
      );
      if (isSearchAndReplace) {
        formData.append('search_prompt', params.search_prompt || userSubject);
        // Optional search-and-replace parameter: grow_mask
        if (params.grow_mask !== undefined) {
          formData.append('grow_mask', params.grow_mask.toString());
        }
      } else if (endpoint.includes('/edit/replace-background')) {
        // Replace Background logic
        // Background prompt should only describe the background as per Stability's recommended usage for this endpoint
        formData.append('background_prompt', visualDescription);
      } else if (endpoint.includes('/generate/sd3') && referenceImage) {
        // SD3 Image-to-Image logic
        formData.append('mode', 'image-to-image');
        formData.append('strength', (params.strength || 0.35).toString());
        if (model) formData.append('model', model);
      } else if (endpoint.includes('/control/structure')) {
        // Control Structure logic
        formData.append(
          'control_strength',
          (params.control_strength || 0.7).toString(),
        );
      } else {
        // standard Image-to-Image logic (deprecated or fallback)
        formData.append('mode', 'image-to-image');
        formData.append('strength', (params.strength || 0.45).toString());
        if (model) formData.append('model', model);
      }
    } else {
      // Handle Text-to-Image
      if (model) formData.append('model', model);
      // aspect_ratio is only for T2I endpoints (Core/Ultra/SD3)
      formData.append('aspect_ratio', '1:1');
    }

    this.logger.log(`[generateImage] Calling Stability AI at ${endpoint}...`);
    const startFetch = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'image/*' },
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      this.logger.log(
        `[generateImage] Stability AI response received in ${Date.now() - startFetch}ms. Status: ${response.status} ${response.statusText}`,
      );

      if (!response.ok) {
        if (response.status === 402) {
          throw new Error(
            'Crédits insuffisants sur Stability AI (402). Veuillez recharger votre compte.',
          );
        }
        const errText = await response.text();
        throw new Error(
          `Stability Error: ${response.status} ${response.statusText} - ${errText}`,
        );
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const uploadDir = path.join(process.cwd(), 'uploads', 'ai-generations');
      if (!fs.existsSync(uploadDir))
        fs.mkdirSync(uploadDir, { recursive: true });
      // Save with ID to track better?
      const fileName = `gen_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${outputFormat}`;
      const filePath = path.join(uploadDir, fileName);
      fs.writeFileSync(filePath, buffer);
      const publicUrl = `https://hipster-api.fr/uploads/ai-generations/${fileName}`;
      this.logger.log(`[generateImage] Image saved to: ${filePath}`);
      this.logger.log(`[generateImage] Public URL: ${publicUrl}`);

      let generationId: number | undefined;
      if (userId) {
        const saved = await this.aiGenRepo.save({
          user: { id: userId } as AiUser,
          type: AiGenerationType.IMAGE,
          prompt: basePrompt.substring(0, 1000),
          result: publicUrl,
          title: (params.userQuery || 'AI Image').substring(0, 40),
          attributes: { ...params, engine: model || 'core', style },
        });
        generationId = saved.id;
      }

      return { url: publicUrl, generationId };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(
          'Délai d’attente dépassé (60s) pour Stability AI. Le service est peut-être surchargé.',
        );
      }
      throw err;
    }
  }

  /* --------------------- SOCIAL POSTS --------------------- */
  async generateSocial(
    params: any,
    userId?: number,
    file?: Express.Multer.File,
  ) {
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
        'Minimal Studio',
        userId,
        file,
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
    file?: Express.Multer.File,
  ) {
    const flyerPrompt = this.constructFlyerPrompt(params);
    const systemNegative = this.constructNegativeFlyerPrompt();

    console.log('[generateFlyer] Using OpenAI with refined prompts');

    const imageResult = await this.generateImage(
      { ...params, userQuery: flyerPrompt },
      'Minimal Studio',
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
    const style = workflowAnswers?.style || 'Modern';
    const promotion =
      workflowAnswers?.promotion && workflowAnswers.promotion !== 'Aucune'
        ? workflowAnswers.promotion
        : '';
    const tone = workflowAnswers?.tone || 'Professional';

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
