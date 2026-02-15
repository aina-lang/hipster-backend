import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import OpenAI from 'openai';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as FormData from 'form-data';
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

  /* --------------------- POSTURE DETECTION --------------------- */
  private async detectPostureChange(query: string): Promise<boolean> {
    if (!query || query.trim().length === 0) return false;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `
              You are a posture change detector for an AI image generation system.
              The user provides a reference image and a text modification request.
              Your job is to determine if the text request implies changing the person's body posture, physical position, gesture, or anatomical structure compared to the original photo.
              
              Examples of posture changes: "make me sit", "walking in the park", "with arms crossed", "dancing", "leaning against a wall", "standing up".
              Examples of non-posture changes: "change my clothes", "add glasses", "make the background blue", "improve the light", "make me look younger", "add a watch".
              
              Respond ONLY with "YES" if it's a posture/positional change, and "NO" if it's purely about accessories, clothing, background, or lighting.
            `.trim(),
          },
          {
            role: 'user',
            content: `User Request: "${query}"`,
          },
        ],
        temperature: 0,
        max_tokens: 5,
      });

      const result = response.choices[0]?.message?.content
        ?.trim()
        .toUpperCase();
      this.logger.log(
        `[detectPostureChange] Query: "${query}" -> Result: ${result}`,
      );
      return result === 'YES';
    } catch (error) {
      this.logger.error('[detectPostureChange] Error:', error);
      return false;
    }
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
    No smooth plastic skin, no neon, no 3d render, no generic AI artifacts, 
    no distorted faces, no extra fingers, no blurry background unless intentional.
  `.trim();

  private async refineSubject(job: string): Promise<string> {
    if (!job) return '';
    const cleanJob = job.replace(/^(autre|other)[:\s-]*/i, '').trim();
    if (
      !cleanJob ||
      cleanJob.toLowerCase() === 'autre' ||
      cleanJob.toLowerCase() === 'other'
    )
      return '';

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
          { role: 'user', content: cleanJob },
        ],
        temperature: 0.3,
        max_tokens: 15,
      });
      return resp.choices[0]?.message?.content?.trim() || cleanJob;
    } catch (e) {
      return cleanJob;
    }
  }

  private getRandomItem(pool: string[]): string {
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private getStyleDescription(styleName: string, job: string): string {
    const jobStr = job || 'professional';

    // Premium Style with randomized pools
    if (styleName === 'Premium') {
      const subjects = [
        'athletic coach portrait',
        'barber holding scissors',
        'fashion model in black dress',
        'architect in suit',
        'restaurant chef portrait',
        'burger close-up dramatic',
      ];
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

      const subject = job;
      const accent = this.getRandomItem(accentColors);
      const lighting = this.getRandomItem(lightings);
      const angle = this.getRandomItem(angles);
      const bg = this.getRandomItem(backgrounds);

      return `
        Ultra high contrast black and white portrait of ${subject}, editorial poster style, 
        ${lighting}, ${angle}, dramatic shadows, sharp facial details, subject centered, ${bg}.
        Large bold typography integrated into the composition (letters behind or in front of the subject, partially masking the face or body).
        Graphic design elements: thin geometric lines, frame corners, layout guides, subtle grid overlay, modern poster composition.
        Add one accent color only (${accent}) used in small geometric shapes or highlights.
        High fashion magazine aesthetic, luxury campaign, premium branding, sharp focus, ultra clean, professional studio lighting.
        No watermark, no random text, no logo. Monochrome base.
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
      `[generateImage] User: ${userId}, Seed: ${seed}, Style: ${styleName}`,
    );

    let subject = params.job || '';
    if (subject && subject.length > 0) {
      subject = await this.refineSubject(subject);
    }

    const baseStylePrompt = this.getStyleDescription(styleName, subject);
    const userQuery = (params.userQuery || '').trim();

    const apiKey = this.stabilityApiKey;
    if (!apiKey) throw new Error('Missing STABILITY API KEY');

    // Style Preset handling
    const customStyles = ['Hero Studio', 'Premium', 'Minimal Studio'];
    let stylePreset = '';
    if (!customStyles.includes(styleName)) {
      stylePreset =
        styleName === 'None' || !styleName ? 'photographic' : styleName;
    }

    let endpoint =
      'https://api.stability.ai/v2beta/stable-image/generate/ultra';
    let isPostureChange = false;
    let visualDescription = '';

    if (file) {
      isPostureChange = await this.detectPostureChange(userQuery);

      visualDescription = `
        STYLE: ${baseStylePrompt}
        IDENTITY PRESERVATION: Keep face and core features identical to reference.
        MODIFICATIONS: ${userQuery}.
        ${isPostureChange ? 'POSITION: Change posture/position as requested.' : 'POSTURE: Maintain original posture exactly.'}
        QUALITY: Professional photography, 8k, authentic skin textures.
        NEGATIVE: ${this.NEGATIVE_PROMPT}
      `.trim();
    } else {
      visualDescription = `
        ${baseStylePrompt}
        ${userQuery ? `CONTEXT: ${userQuery}` : ''}
        QUALITY: highly detailed professional photography, 8k resolution.
        NEGATIVE: ${this.NEGATIVE_PROMPT}
      `.trim();
    }

    const formData = new FormData();
    formData.append('prompt', visualDescription);
    formData.append('output_format', 'png');
    if (stylePreset) {
      formData.append('style_preset', stylePreset);
    }

    if (file) {
      formData.append('image', file.buffer, file.originalname);
      formData.append('strength', isPostureChange ? 0.6 : 0.45);
    }

    if (seed) formData.append('seed', seed);

    try {
      const response = await axios.post(endpoint, formData, {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${apiKey}`,
          Accept: 'image/*',
        },
        responseType: 'arraybuffer',
      });
      const buffer = Buffer.from(response.data);
      const fileName = `gen_${Date.now()}.png`;
      const uploadDir = path.join(process.cwd(), 'uploads', 'ai-generations');

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const filePath = path.join(uploadDir, fileName);
      fs.writeFileSync(filePath, buffer);

      const publicUrl = `https://hipster-api.fr/uploads/ai-generations/${fileName}`;

      const saved = await this.saveGeneration(
        userId,
        '',
        visualDescription,
        AiGenerationType.IMAGE,
        params,
        publicUrl,
      );

      return {
        url: publicUrl,
        generationId: saved?.id,
        seed: seed || 0,
      };
    } catch (error) {
      this.logger.error(
        '[generateImage] Error:',
        error.response?.data?.toString() || error.message,
      );
      throw error;
    }
  }

  async generateText(params: any, type: string, userId: number) {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: `Type: ${type}\nParams: ${JSON.stringify(params)}`,
          },
        ],
      });
      const result = response.choices[0]?.message?.content || '';
      const saved = await this.saveGeneration(
        userId,
        result,
        '',
        type as AiGenerationType,
        params,
      );
      return { content: result, generationId: saved?.id };
    } catch (error) {
      this.logger.error(`[generateText] Error: ${error.message}`);
      throw error;
    }
  }

  /* --------------------- SOCIAL POSTS (ORCHESTRATED) --------------------- */
  async generateSocial(
    params: any,
    userId: number,
    file?: Express.Multer.File,
    seed?: number,
  ) {
    if (typeof params === 'string') params = { userQuery: params };
    this.logger.log(`[generateSocial] User: ${userId}`);

    let brandingContext = '';
    if (userId) {
      const u = await this.getAiUserWithProfile(userId);
      if (u) {
        brandingContext = `Nom: ${u.name}, Job: ${u.job}`;
      }
    }

    const orchestration = await this.orchestrateSocial(
      params.userQuery,
      brandingContext,
      `Function: ${params.function || 'General'}`,
    );

    let imageRes: any = { url: '' };
    // Bias towards generating image if file provided or if orchestration says so
    if (orchestration.generateImage || !!file) {
      imageRes = await this.generateImage(
        {
          ...params,
          userQuery: orchestration.imagePrompt || params.userQuery,
        },
        params.style || 'Hero Studio',
        userId,
        file,
        seed,
      );
    }

    let textRes: any = { content: '' };
    if (orchestration.generateText) {
      textRes = await this.generateText(
        { prompt: orchestration.captionText || params.userQuery },
        'social',
        userId,
      );
    }

    return {
      image: imageRes.url || '',
      text: textRes.content || '',
      orchestration,
      generationId: imageRes.generationId || textRes.generationId,
    };
  }

  private async orchestrateSocial(
    query: string,
    branding: string,
    context: string,
  ) {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `
              You are a social media orchestrator. 
              Decide if an image and/or text caption is needed for the given query.
              Most social posts BENEFIT from an image. 
              
              Respond STRICTLY in JSON with:
              {
                "generateImage": boolean,
                "generateText": boolean,
                "imagePrompt": "visual description for image generation (in English)",
                "captionText": "the actual social media post text (in French by default)"
              }
            `.trim(),
          },
          {
            role: 'user',
            content: `User Query: "${query}"\nUser Branding: ${branding}\nContext: ${context}`,
          },
        ],
        response_format: { type: 'json_object' },
      });
      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      this.logger.error(`[orchestrateSocial] Error: ${error.message}`);
      return {
        generateImage: true,
        generateText: true,
        imagePrompt: query,
        captionText: query,
      };
    }
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
