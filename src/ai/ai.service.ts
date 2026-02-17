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
    extra fingers, mutated hands, six fingers, four fingers, 
    extra limbs, detached limbs, missing limbs, fused fingers, deformed hands, 
    cloned face, multiple heads, two heads, extra heads, distorted face, 
    blurry, out of focus, low quality, pixelated, grain, lowres, 
    text, watermark, logo, signature, letters, words, captions, labels,
    cgi, 3d, render, cartoon, anime, illustration, drawing, digital art,
    smooth plastic skin, artificial, airbrushed, unnatural skin,
    mustache, beard, facial hair, stubble (unless specified),
    plastic, wax, doll, fake, unreal engine, octane render, oversaturated, 
    high contrast, artificial lighting, porcelain, rubber, skin blemishes, 
    distorted eyes, asymmetrical face, hyper-saturated, glowing edges,
    vibrant neon colors (unless specified), bad anatomy, bad proportions,
    amateur, draft, distorted facial features, plastic textures, oversmoothed skin,
    uncanny valley, oversaturated colors, multiple people, low resolution, 
    photo-collage, heavy makeup, fake eyelashes, distorted gaze.
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

  private async refineQuery(
    query: string,
    job: string,
    styleName: string,
  ): Promise<{ prompt: string; isPostureChange: boolean }> {
    if (!query) return { prompt: '', isPostureChange: false };
    try {
      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert stable diffusion prompt engineer. 
            Transform the user's short request into a detailed, descriptive scene for an image-to-image or text-to-image generation.
            
            COHERENCE RULE: You MUST merge the chosen Style ("${styleName}") and the user's "Job/Subject" into a single, unified aesthetic. The lighting, environment, and artistic mood MUST follow the style definition while the subject follows the user request.
            
            POSTURE RULE: If the request implies a change in posture (e.g., "sitting", "walking", "holding a glass"), describe the body position vividly.
            
            OUTPUT FORMAT: Return ONLY a JSON object:
            {
              "prompt": "expanded English prompt integrating style and request",
              "isPostureChange": boolean // true if user wants a different body position than a standard portrait
            }`,
          },
          { role: 'user', content: query },
        ],
        response_format: { type: 'json_object' },
      });
      const data = JSON.parse(resp.choices[0]?.message?.content || '{}');
      this.logger.log(`[refineQuery] Result: ${JSON.stringify(data)}`);
      return {
        prompt: data.prompt || query,
        isPostureChange: !!data.isPostureChange,
      };
    } catch (e) {
      this.logger.error(`[refineQuery] Error: ${e.message}`);
      return { prompt: query, isPostureChange: false };
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
      return `Professional high-end photographic representation of ${jobStr} perfectly integrated into a detailed ${styleName} environment. Authentic textures, natural atmospheric lighting, and meticulous attention to ${styleName} aesthetic details.`;
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
          Accept: 'image/*',
          'Stability-Client-ID': 'Hypster-App',
          'Stability-Client-Version': '1.0.0',
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

  private async uploadToOpenAiFiles(image: Buffer): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('file', image, {
        filename: 'image.png',
        contentType: 'image/png',
      });
      formData.append('purpose', 'vision');

      const response = await axios.post(
        'https://api.openai.com/v1/files',
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${this.openAiKey}`,
          },
        },
      );
      this.logger.log(
        `[uploadToOpenAiFiles] SUCCESS - File ID: ${response.data.id}`,
      );
      return response.data.id;
    } catch (error) {
      this.logger.error(`[uploadToOpenAiFiles] Error: ${error.message}`);
      throw error;
    }
  }

  private async callOpenAiImageEdit(
    image: Buffer,
    prompt: string,
  ): Promise<Buffer> {
    this.logger.log(
      `[callOpenAiImageEdit] Starting high-fidelity edit with gpt-image-1.5`,
    );

    try {
      const truncatedPrompt = prompt.substring(0, 2000);
      const formData = new FormData();
      formData.append('model', 'gpt-image-1.5');
      formData.append('prompt', truncatedPrompt);
      formData.append('image', image, {
        filename: 'image.png',
        contentType: 'image/png',
      });
      formData.append('input_fidelity', 'high');
      formData.append('quality', 'high');
      formData.append('size', '1024x1536');
      formData.append('response_format', 'b64_json');

      this.logger.log(
        `[callOpenAiImageEdit] Sending request to OpenAI gpt-image-1.5`,
      );

      const response = await axios.post(
        'https://api.openai.com/v1/images/edits',
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${this.openAiKey}`,
          },
        },
      );

      const b64 = response.data.data?.[0]?.b64_json;
      if (!b64) {
        this.logger.error(
          `[callOpenAiImageEdit] Missing b64_json in response: ${JSON.stringify(response.data)}`,
        );
        throw new Error('No image data returned from OpenAI');
      }

      return Buffer.from(b64, 'base64');
    } catch (e) {
      if (e.response) {
        this.logger.error(
          `[callOpenAiImageEdit] API FAILED: ${JSON.stringify(e.response.data)}`,
        );
      } else {
        this.logger.error(`[callOpenAiImageEdit] FAILED: ${e.message}`);
      }
      throw e;
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

    let refinedQuery = userQuery;
    let isPostureChange = false;

    // Enable GPT-powered prompt expansion for ALL modes (with or without image)
    if (userQuery) {
      const refinedData = await this.refineQuery(
        userQuery,
        refinedSubject,
        styleName,
      );
      refinedQuery = refinedData.prompt;
      isPostureChange = refinedData.isPostureChange;
    }

    try {
      let finalBuffer: Buffer;

      const qualityTags =
        'masterpiece, ultra high quality, photorealistic, 8k resolution, highly detailed natural skin texture, sharp focus, soft natural lighting, professional photography, cinematic composition, realistic hair, clear eyes';

      // Build the final prompt by combining the base style guide with the refined query.
      // We keep the baseStylePrompt even if refinedQuery exists to anchor the style.
      const promptBody = refinedQuery
        ? `${refinedQuery}. Aesthetic: ${baseStylePrompt}.`
        : baseStylePrompt;

      const finalPrompt = `STYLE: ${styleName}. ${promptBody} QUALITY: ${qualityTags}`;

      let finalNegativePrompt = this.NEGATIVE_PROMPT;

      // Additional specific filters for high-end styles
      if (
        styleName.toLowerCase().includes('premium') ||
        styleName.toLowerCase().includes('hero')
      ) {
        finalNegativePrompt = `
          ${this.NEGATIVE_PROMPT},
          glitch, noise, low contrast, oversaturated, distorted facial proportions, 
          mismatched eyes, weird gaze.
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
        this.logger.log(`[generateImage] Strategy: OpenAI GPT-Image 1.5`);
        finalBuffer = await this.callOpenAiImageEdit(
          file.buffer,
          finalPrompt,
        );
      } else {
        // EXCLUSIVE ULTRA TEXT-TO-IMAGE
        this.logger.log(`[generateImage] Strategy: Ultra Text-to-Image`);
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

  /**
   * Generate an image in FREE MODE from a text prompt
   * No reference image, purely text-to-image generation
   */
  async generateFreeImage(params: any, userId: number, seed?: number) {
    this.logger.log(
      `[generateFreeImage] START - User: ${userId}, Prompt: ${params.prompt || params.query}`,
    );
    try {
      // Call generateImage without a file (triggers text-to-image path)
      const result = await this.generateImage(
        {
          userQuery: params.prompt || params.query || '',
          style: params.style || 'photographic',
          job: params.subject || '', // Optional: for refined subject description
        },
        params.style || 'photographic',
        userId,
        undefined, // No file for free mode
        seed,
      );

      this.logger.log(`[generateFreeImage] SUCCESS - URL: ${result.url}`);
      return result;
    } catch (error) {
      this.logger.error(`[generateFreeImage] Error: ${error.message}`);
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
    this.logger.log(
      `[chat] START - User: ${userId}, Messages: ${messages.length}, ConversationId: ${conversationId}`,
    );
    try {
      // Get the last user message to detect request type
      const lastUserMessage =
        messages
          .slice()
          .reverse()
          .find((m) => m.role === 'user')?.content || '';

      this.logger.log(`[chat] Last message: "${lastUserMessage}"`);

      // Detect if user is requesting an image
      const requestType = await this.detectChatRequestType(lastUserMessage);

      if (requestType === 'image') {
        this.logger.log('[chat] Image generation detected, generating...');
        // Generate image from user prompt
        const imageResult = await this.generateFreeImage(
          { prompt: lastUserMessage },
          userId,
        );

        // Download the image and convert it to base64
        let imageData = '';
        try {
          const resp = await axios.get(imageResult.url, {
            responseType: 'arraybuffer',
          });
          imageData = Buffer.from(resp.data).toString('base64');
          this.logger.log('[chat] Image downloaded and converted to base64');
        } catch (e) {
          this.logger.error(
            `[chat] Failed to download image: ${e.message}, falling back to URL`,
          );
          imageData = imageResult.url;
        }

        return {
          type: 'image',
          content: `Voici l'image générée`,
          imageBase64: imageData,
          generationId: imageResult.generationId,
        };
      }

      // Otherwise, generate text response
      this.logger.log('[chat] Text response generation...');
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages,
      });

      const content = response.choices[0]?.message?.content || '';
      this.logger.log(
        `[chat] Response generated: ${content.substring(0, 50)}...`,
      );

      return {
        type: 'text',
        content: content,
      };
    } catch (error) {
      this.logger.error(`[chat] Error: ${error.message}`);
      throw error;
    }
  }

  private async detectChatRequestType(
    message: string,
  ): Promise<'image' | 'text'> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Analyze the user message and determine if they are asking for:
            - "image": Any request to generate, create, draw, imagine, show a visual, photo, picture, etc.
            - "text": General questions, answers, explanations, conversations, etc.
            
            Respond with ONLY the word "image" or "text".`,
          },
          {
            role: 'user',
            content: message,
          },
        ],
        temperature: 0,
        max_tokens: 10,
      });

      const result = response.choices[0]?.message?.content
        ?.trim()
        .toLowerCase();
      return result === 'image' ? 'image' : 'text';
    } catch (error) {
      this.logger.error(`[detectChatRequestType] Error: ${error.message}`);
      return 'text'; // Default to text on error
    }
  }
}
