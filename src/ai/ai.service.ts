import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import OpenAI from 'openai';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as FormData from 'form-data';
import * as sharp from 'sharp';
import { AiUser, PlanType } from './entities/ai-user.entity';
import {
  AiGeneration,
  AiGenerationType,
} from './entities/ai-generation.entity';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAI;
  private readonly stabilityApiKey: string;
  private readonly openAiKey: string;

  constructor(
    private configService: ConfigService,
    @InjectRepository(AiUser)
    private aiUserRepo: Repository<AiUser>,
    @InjectRepository(AiGeneration)
    private aiGenRepo: Repository<AiGeneration>,
  ) {
    this.openAiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.stabilityApiKey = this.configService.get<string>('STABLE_API_KEY');

    this.openai = new OpenAI({
      apiKey: this.openAiKey,
    });
  }

  /* --------------------- PUBLIC HELPERS --------------------- */
  public async getAiUserWithProfile(userId: number) {
    try {
      return await this.aiUserRepo.findOne({
        where: { id: userId },
      });
    } catch (error) {
      this.logger.error(`[getAiUserWithProfile] Error: ${error.message}`);
      return null;
    }
  }

  private async saveGeneration(
    userId: number,
    result: string,
    prompt: string,
    type: AiGenerationType,
    attributes: any = {},
    imageUrl?: string,
  ) {
    try {
      const gen = this.aiGenRepo.create({
        user: { id: userId } as any,
        result,
        prompt,
        type,
        attributes,
        imageUrl,
      });
      return await this.aiGenRepo.save(gen);
    } catch (error) {
      this.logger.error(`[saveGeneration] Error: ${error.message}`);
      return null;
    }
  }

  private readonly NEGATIVE_PROMPT = `
    smooth plastic skin, artificial skin, airbrushed, over-smoothed, generic AI artifacts, 
    3d render, cartoon, illustration, low resolution, blurry, out of focus, 
    distorted faces, extra fingers, messy anatomy.
    CRITICAL: No text, no letters, no typography, no words, no watermarks, no captions, no labels.
    No mustache, no beard, no facial hair, no stubble.
  `.trim();

  private async refineSubject(job: string): Promise<string> {
    if (!job || job.trim().length === 0) return '';

    try {
      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Refine the user's job, function, or role into a concise 2-3 word visual subject for an image prompt (in English).
            If the input is already a good subject, just translate it to English.
            Example: "Développeur fullstack" -> "software engineer", "Chef de cuisine" -> "restaurant chef", "Un gars qui fait du crossfit" -> "crossfit athlete".
            Respond ONLY with the refined subject without any punctuation.`,
          },
          { role: 'user', content: job },
        ],
        temperature: 0.3,
        max_tokens: 15,
      });
      const refined = resp.choices[0]?.message?.content?.trim() || job;
      this.logger.log(`[refineSubject] Result: "${refined}"`);
      return refined;
    } catch (e) {
      this.logger.error(`[refineSubject] Error: ${e.message}`);
      return job;
    }
  }

  private getRandomItem(pool: string[]): string {
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private getStyleDescription(styleName: string, job: string): string {
    const jobStr = job || 'professional';

    // Premium Style with randomized pools (New Spec)
    if (styleName === 'Premium') {
      const accentColors = [
        'deep red',
        'burnt orange',
        'electric purple',
        'muted gold',
      ];
      const lightings = [
        'side lighting dramatic',
        'top light cinematic',
        'rim light silhouette',
        'split lighting high contrast',
        'soft diffused studio light',
      ];
      const angles = [
        'slight low angle',
        'slight high angle',
        'profile view',
        'three quarter view',
        'centered frontal portrait',
      ];
      const backgrounds = [
        'textured dark concrete background',
        'minimal white seamless studio',
        'grainy film texture',
        'matte charcoal backdrop',
        'soft gradient grey background',
      ];

      const accent = this.getRandomItem(accentColors);
      const lighting = this.getRandomItem(lightings);
      const angle = this.getRandomItem(angles);
      const bg = this.getRandomItem(backgrounds);

      return `
        Ultra high contrast black and white portrait of ${jobStr}, high-end fashion editorial style. 
        ${lighting}, ${angle}, strong cinematic lighting, dramatic shadows, sharp facial details.
        ${bg}.

        Graphic design overlay: Minimalist luxury poster layout. 
        Subtle design elements: thin professional geometric lines, frame corners, and layout guides.
        
        STRICT COLOR RULE: 
        The image is monochrome black and white. 
        ONE ACCENT COLOR ONLY: ${accent}, used ONLY in small object or thin highlights.
        
        CRITICAL: The portrait must be ONE cohesive image. DO NOT create a collage. 
        Graphic elements must NOT overlap, cut, or distort the person's facial features. 
        The face must be 100% visible and untouched by overlays.
        
        High fashion magazine aesthetic, luxury campaign, premium branding, sharp focus, ultra clean, professional studio lighting.
        No watermark, no random text, no logo.
      `.trim();
    }

    if (styleName === 'Hero Studio') {
      return `Heroic cinematic studio shot centered on ${jobStr}. Dark premium background, dramatic lighting.`;
    }
    if (styleName === 'Minimal Studio') {
      return `Minimal clean studio shot centered on ${jobStr}. Soft natural light, clean white/neutral background.`;
    }

    // Standard Stability Style Presets
    const stabilityPresets = [
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

    if (stabilityPresets.includes(styleName)) {
      return `Professional representation of ${jobStr}.`;
    }

    return `Professional high-quality representation of ${jobStr}. Style: ${styleName}.`;
  }

  /* --------------------- STABILITY API TOOLS --------------------- */

  private async callStabilityApi(
    endpoint: string,
    formData: FormData,
  ): Promise<Buffer> {
    const apiKey = this.stabilityApiKey;
    if (!apiKey) throw new Error('Missing STABILITY API KEY');

    const baseUrl = endpoint.startsWith('v1/')
      ? 'https://api.stability.ai'
      : 'https://api.stability.ai/v2beta';

    const fullUrl = `${baseUrl}/${endpoint}`;
    this.logger.log(`[callStabilityApi] POST ${fullUrl}`);

    try {
      const response = await axios.post(fullUrl, formData, {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${apiKey}`,
          Accept: 'image/png',
        },
        responseType: 'arraybuffer',
      });
      return Buffer.from(response.data);
    } catch (error: any) {
      if (error.response && error.response.data) {
        try {
          const errorData = JSON.parse(
            Buffer.from(error.response.data).toString(),
          );
          this.logger.error(
            `[callStabilityApi] FAILED: ${JSON.stringify(errorData)}`,
          );
        } catch (e) {
          this.logger.error(
            `[callStabilityApi] FAILED (raw): ${Buffer.from(error.response.data).toString()}`,
          );
        }
      }
      throw error;
    }
  }

  private async callUltra(
    prompt: string,
    image?: Buffer,
    strength?: number,
    seed?: number,
    negativePrompt?: string,
    aspectRatio?: string,
  ): Promise<Buffer> {
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('output_format', 'png');

    if (image) {
      formData.append('image', image, 'source.png');
      if (strength !== undefined) {
        formData.append('strength', strength.toString());
      }
    } else if (aspectRatio) {
      formData.append('aspect_ratio', aspectRatio);
    }

    if (seed) formData.append('seed', seed.toString());
    if (negativePrompt) formData.append('negative_prompt', negativePrompt);

    return this.callStabilityApi('stable-image/generate/ultra', formData);
  }

  /**
   * Legacy SDXL 1.0 Image-to-Image for precise strength control.
   * Engine: stable-diffusion-xl-1024-v1-0
   */
  private async callV1ImageToImage(
    prompts: { text: string; weight: number }[],
    image: Buffer,
    strength: number = 0.35,
    seed?: number,
    negativePrompt?: string,
    stylePreset?: string,
    cfgScale: number = 7,
    steps: number = 30,
    sampler?: string,
    samples: number = 1,
    clipGuidancePreset: string = 'NONE',
  ): Promise<Buffer> {
    // SDXL V1 requires specific dimensions (e.g. 1024x1024)
    const resizedImage = await sharp(image)
      .resize(1024, 1024, {
        fit: 'cover',
        withoutEnlargement: false,
      })
      .toFormat('png')
      .toBuffer();

    const formData = new FormData();
    formData.append('init_image', resizedImage, 'init.png');
    formData.append('init_image_mode', 'IMAGE_STRENGTH');
    formData.append('image_strength', strength.toString());

    // Multi-prompt support for better control
    prompts.forEach((p, idx) => {
      formData.append(`text_prompts[${idx}][text]`, p.text);
      formData.append(`text_prompts[${idx}][weight]`, p.weight.toString());
    });

    if (negativePrompt) {
      const negIdx = prompts.length;
      formData.append(`text_prompts[${negIdx}][text]`, negativePrompt);
      formData.append(`text_prompts[${negIdx}][weight]`, '-1');
    }

    if (seed) formData.append('seed', seed.toString());
    if (stylePreset && stylePreset !== 'None') {
      formData.append('style_preset', stylePreset);
    }

    formData.append('cfg_scale', cfgScale.toString());
    formData.append('steps', steps.toString());
    formData.append('samples', samples.toString());
    if (sampler) {
      formData.append('sampler', sampler);
    }

    const engineId = 'stable-diffusion-xl-1024-v1-0';
    const endpoint = `v1/generation/${engineId}/image-to-image`;

    return this.callStabilityApi(endpoint, formData);
  }

  /* --------------------- IMAGE GENERATION --------------------- */
  async generateImage(
    params: any,
    style: string,
    userId: number,
    file?: Express.Multer.File,
    seed?: number,
  ) {
    const styleName = style || params.style || 'Hero Studio';
    this.logger.log(
      `[generateImage] START - User: ${userId}, Seed: ${seed}, Style: ${styleName}, Job: ${params.job}, Query: ${params.userQuery}`,
    );

    let refinedSubject = '';
    if (params.job && params.job.length > 0) {
      refinedSubject = await this.refineSubject(params.job);
    }

    const baseStylePrompt = this.getStyleDescription(styleName, refinedSubject);
    const userQuery = (params.userQuery || '').trim();

    try {
      let finalBuffer: Buffer;

      const qualityTags =
        'shot on Canon EOS R5, f/1.8, 85mm lens, highly detailed, professional photography, natural skin texture, subtle film grain, sharp focus, 8k resolution';
      const finalPrompt = userQuery
        ? `${userQuery}. STYLE: ${baseStylePrompt}. QUALITY: ${qualityTags}`
        : `${baseStylePrompt}. QUALITY: ${qualityTags}`;

      let finalNegativePrompt = this.NEGATIVE_PROMPT;
      if (styleName === 'Premium') {
        finalNegativePrompt = `
          ${this.NEGATIVE_PROMPT},
          NO COLOR ON FACE, NO GEOMETRIC LINES ON EYES OR MOUTH, NO DISTORTED FACIAL FEATURES.
        `.trim();
      }

      // Mapping for Stability V1 Presets
      const stabilityPresets = [
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
      const stylePreset = stabilityPresets.includes(styleName)
        ? styleName
        : undefined;

      if (file) {
        this.logger.log(
          `[generateImage] Using DIRECT V1 Image-to-Image (Strength: 0.45 with Multi-Prompt)`,
        );

        // Weighted prompts to balance Environmental Change vs Identity
        const prompts = [
          { text: finalPrompt, weight: 1.0 }, // The Scene & Style
          {
            text: "highly detailed face, consistent facial features, sharp portrait, preservation of person's identity",
            weight: 0.8, // The Identity (slightly lower to allow scene change)
          },
        ];

        finalBuffer = await this.callV1ImageToImage(
          prompts,
          file.buffer,
          0.45, // Sweet spot: enough to change background but keep face
          seed,
          finalNegativePrompt,
          stylePreset,
        );
      } else {
        this.logger.log(
          `[generateImage] Calling Stability Ultra (Text-to-Image)`,
        );
        finalBuffer = await this.callUltra(
          finalPrompt,
          undefined,
          undefined,
          seed,
          finalNegativePrompt,
        );
      }

      const fileName = `gen_${Date.now()}.png`;
      const uploadPath = path.join(process.cwd(), 'uploads', 'ai-generations');
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }

      const filePath = path.join(uploadPath, fileName);
      fs.writeFileSync(filePath, finalBuffer);

      const imageUrl = `https://hipster-api.fr/uploads/ai-generations/${fileName}`;

      const saved = await this.saveGeneration(
        userId,
        file ? 'IMAGE_EDIT_ULTRA' : 'TEXT_TO_IMAGE_ULTRA',
        finalPrompt,
        AiGenerationType.IMAGE,
        {
          style: styleName,
          seed,
          hasSourceImage: !!file,
        },
        imageUrl,
      );

      this.logger.log(`[generateImage] SUCCESS - URL: ${imageUrl}`);
      return {
        url: imageUrl,
        generationId: saved?.id,
        seed: seed || 0,
      };
    } catch (error) {
      this.logger.error(`[generateImage] FAILED: ${error.message}`);
      throw error;
    }
  }

  async generateText(params: any, type: string, userId: number) {
    this.logger.log(
      `[generateText] START - User: ${userId}, Type: ${type}, Params: ${JSON.stringify(params)}`,
    );
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a professional ${type} content writer. 
            LANGUAGE: Write STRICTLY in French.
            STYLE: Professional, engaging, and well-formatted with clear line breaks between paragraphs.
            EMOJIS: Use emojis occasionally and relevantly (not too many).
            BRANDING: If branding information (name, contact, address) is provided in the params, include it naturally in the text (e.g., at the end or in a "Contact" section) so the reader knows who to reach out to.
            CRITICAL FORMATTING RULE: Never use markdown formatting (no **, __, ##, italic, bold, etc.). 
            Write plain text only. 
            For social media posts, include relevant hashtags at the end.`,
          },
          {
            role: 'user',
            content: `Type: ${type}\nParams: ${JSON.stringify(params)}`,
          },
        ],
      });
      const result = response.choices[0]?.message?.content || '';

      // Map sub-types (social, blog, ad, etc.) to valid base enum
      const validBaseTypes = Object.values(AiGenerationType) as string[];
      let baseType = AiGenerationType.TEXT;

      if (validBaseTypes.includes(type)) {
        baseType = type as AiGenerationType;
      }

      const saved = await this.saveGeneration(userId, result, '', baseType, {
        ...params,
        subType: type,
      });
      this.logger.log(
        `[generateText] SUCCESS - Generated ${result.length} chars, ID: ${saved?.id}`,
      );
      return { content: result, generationId: saved?.id };
    } catch (error) {
      this.logger.error(`[generateText] Error: ${error.message}`);
      throw error;
    }
  }

  /* --------------------- SOCIAL POSTS (DIRECT ULTRA) --------------------- */
  async generateSocial(
    params: any,
    userId: number,
    file?: Express.Multer.File,
    seed?: number,
  ) {
    if (typeof params === 'string') params = { userQuery: params };
    this.logger.log(
      `[generateSocial] START - User: ${userId}, Job: "${params.job}", Query: "${params.userQuery}"`,
    );

    // 1. Fetch user branding info
    let brandingInfo = '';
    const user = await this.getAiUserWithProfile(userId);
    if (user) {
      const parts = [];
      if (user.name) parts.push(`Nom: ${user.name}`);
      if (user.professionalPhone) parts.push(`Tel: ${user.professionalPhone}`);
      if (user.professionalAddress)
        parts.push(`Adresse: ${user.professionalAddress}`);
      if (user.email) parts.push(`Email: ${user.email}`);
      brandingInfo = parts.join(', ');
    }

    // 2. Generate Image (Direct Ultra)
    const imageRes = await this.generateImage(
      params,
      params.style || 'Hero Studio',
      userId,
      file,
      seed,
    );

    // 3. Generate Caption (Simple GPT)
    const textRes = await this.generateText(
      { ...params, brandingInfo },
      'social',
      userId,
    );

    const result = {
      image: imageRes.url || '',
      text: textRes.content || '',
      generationId: imageRes.generationId,
    };

    this.logger.log(
      `[generateSocial] SUCCESS - Image: ${result.image || 'NONE'}, Text Length: ${result.text.length}`,
    );
    return result;
  }

  /* --------------------- OTHER SPECIALIZED METHODS (PLACEHOLDERS) --------------------- */
  async generateFlyer(
    params: any,
    userId: number,
    file?: Express.Multer.File,
    seed?: number,
  ) {
    const style = params.style || 'Minimal Studio';
    const result = await this.generateImage(params, style, userId, file, seed);
    return { ...result, url: result.url };
  }

  async transcribeAudio(file: Express.Multer.File) {
    return { text: 'Transcribed text' };
  }

  async applyWatermark(url: string, isPremium: boolean) {
    return url;
  }

  async generateDocument(type: string, params: any, userId: number) {
    return { url: 'doc_url' };
  }

  async exportDocument(
    id: number,
    format: string,
    userId: number,
    model?: string,
  ) {
    return {
      buffer: Buffer.from(''),
      fileName: 'doc.pdf',
      mimeType: 'application/pdf',
    };
  }

  async generateVideo(params: any, userId: number, seed?: number) {
    return { url: 'video_url' };
  }

  async generateAudio(params: any, userId: number, seed?: number) {
    return { url: 'audio_url' };
  }

  async getHistory(userId: number) {
    try {
      return await this.aiGenRepo.find({
        where: { user: { id: userId } },
        order: { createdAt: 'DESC' },
        take: 50,
      });
    } catch (error) {
      this.logger.error(`[getHistory] Error: ${error.message}`);
      return [];
    }
  }

  async getConversation(id: number, userId: number) {
    try {
      return await this.aiGenRepo.findOne({
        where: { id, user: { id: userId } },
      });
    } catch (error) {
      this.logger.error(`[getConversation] Error: ${error.message}`);
      return null;
    }
  }

  /**
   * Regenerate a previous generation using the saved params and seed.
   * If a seedOverride is provided it will be used instead of the saved seed.
   */
  async regenerateFromGeneration(
    generationId: number,
    userId: number,
    seedOverride?: number,
  ) {
    const gen = await this.aiGenRepo.findOne({
      where: { id: generationId },
      relations: ['user'],
    });

    if (!gen) throw new Error('Generation not found');
    if (!gen.user || gen.user.id !== userId)
      throw new Error('Unauthorized to regenerate this generation');

    const params = (gen.attributes as any) || {};
    const savedSeed = params.seed || 0;
    const seedToUse =
      typeof seedOverride === 'number' ? seedOverride : savedSeed || 0;

    const style = params.style || 'Hero Studio';

    // If the original generation had an imageUrl, download the image to use as the reference
    let file: Express.Multer.File | undefined = undefined;
    if (gen.imageUrl) {
      try {
        const resp = await axios.get(gen.imageUrl, {
          responseType: 'arraybuffer',
        });
        file = { buffer: Buffer.from(resp.data) } as any;
      } catch (e) {
        this.logger.error(
          `[regenerateFromGeneration] Failed to download image: ${e.message}`,
        );
      }
    }

    // Reuse the original params and call generateImage
    return await this.generateImage(params, style, userId, file, seedToUse);
  }

  async deleteGeneration(id: number, userId: number) {
    return { success: true };
  }

  async clearHistory(userId: number) {
    return { success: true };
  }

  async refineText(text: string) {
    return { content: text };
  }

  async chat(messages: any[], userId: number, conversationId?: string) {
    return { content: 'Chat response' };
  }
}
