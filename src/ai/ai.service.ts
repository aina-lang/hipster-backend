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

  constructor(
    private configService: ConfigService,
    @InjectRepository(AiUser)
    private aiUserRepo: Repository<AiUser>,
    @InjectRepository(AiGeneration)
    private aiGenRepo: Repository<AiGeneration>,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
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
        relations: ['profile'],
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

  /* --------------------- IMAGE GENERATION --------------------- */
  async generateImage(
    params: any,
    style: string,
    userId: number,
    file?: Express.Multer.File,
    seed?: number,
  ) {
    const styleName = style || params.style || 'Hero Studio';
    this.logger.log(`[generateImage] User: ${userId}, Seed: ${seed}`);

    const commonRealism = `
      QUALITY: highly detailed, professional photography, 8k resolution, authentic skin textures, natural lighting.
      REALISM: No smooth plastic skin, no neon, no 3d render, no generic AI artifacts.
    `.trim();

    let visualDescription = '';
    const refinedQuery = (params.userQuery || '').trim();

    if (styleName === 'Hero Studio') {
      visualDescription = `Heroic cinematic studio shot centered on ${params.job || 'professional'}. Dark premium background. ${commonRealism}`;
    } else if (styleName === 'Minimal Studio') {
      visualDescription = `Minimal clean studio shot centered on ${params.job || 'professional'}. Soft light, clean aesthetic. ${commonRealism}`;
    } else {
      visualDescription = `Professional representation for ${params.job || 'business'}. ${commonRealism}`;
    }

    const apiKey = this.configService.get('STABILITY_API_KEY');
    if (!apiKey) throw new Error('Missing STABILITY API KEY');

    let userPlan = PlanType.CURIEUX;
    if (userId) {
      const user = await this.aiUserRepo.findOne({ where: { id: userId } });
      if (user) userPlan = user.planType || PlanType.CURIEUX;
    }

    let endpoint =
      'https://api.stability.ai/v2beta/stable-image/generate/ultra';
    let isPostureChange = false;

    if (file) {
      isPostureChange = await this.detectPostureChange(params.userQuery || '');

      visualDescription = `
        IDENTITY PRESERVATION: Keep face identical to reference.
        MODIFICATIONS: ${params.userQuery}.
        ${isPostureChange ? 'Change posture/position.' : 'Maintain original posture exactly.'}
        Style: ${styleName}. ${commonRealism}
      `.trim();
    }

    const formData = new FormData();
    formData.append('prompt', visualDescription);
    formData.append('output_format', 'png');

    if (file) {
      formData.append('image', file.buffer, file.originalname);
      if (endpoint.includes('control/structure')) {
        formData.append('control_strength', 0.7);
      } else {
        formData.append('strength', isPostureChange ? 0.6 : 0.45);
      }
    } else {
      formData.append('model', 'sd3-ultra');
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
      const publicUrl = `https://storage.hypster.com/${fileName}`; // Placeholder

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

    let imageRes: any = { url: null };
    if (orchestration.generateImage) {
      imageRes = await this.generateImage(
        {
          ...params,
          userQuery: orchestration.imagePrompt,
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
        { prompt: orchestration.captionText },
        'social',
        userId,
      );
    }

    return {
      image: imageRes.url,
      text: textRes.content,
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
            content: `You are a social media orchestrator. Decide if an image and/or text caption is needed. Respond in JSON.`,
          },
          {
            role: 'user',
            content: `Query: ${query}\nBranding: ${branding}\nContext: ${context}`,
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
