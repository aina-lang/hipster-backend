import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiUser } from './entities/ai-user.entity';
import { AiGeneration, AiGenerationType } from './entities/ai-generation.entity';

import OpenAI from 'openai';

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
    // DIRECT KEY USAGE (TEMPORARY FOR DEBUGGING)
    const apiKey = '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';
    
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
        const lastUserMsg = messages.filter(m => m.role === 'user').pop();
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Erreur AI: ${errorMessage}`);
    }
  }

  async generateText(
    prompt: string,
    type: string,
    userId?: number,
  ): Promise<string> {
    const systemPrompt = `You are an expert copywriter for ${type} content.`;
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
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
    // Mock implementation
    const url = `https://via.placeholder.com/1024x1024.png?text=${encodeURIComponent(prompt)}+(${style})`;

    if (userId) {
      await this.aiGenRepo.save({
        user: { id: userId } as AiUser,
        type: AiGenerationType.IMAGE,
        prompt: prompt,
        result: 'Image generated',
        imageUrl: url,
        title: prompt.substring(0, 30) + '...',
      });
    }

    return url;
  }

  async generateDocument(
    type: 'legal' | 'business',
    params: any,
    userId?: number,
  ): Promise<string> {
    const prompt = `Generate a ${type} document with these parameters: ${JSON.stringify(params)}`;
    const result = await this.generateText(prompt, 'business');

    if (userId) {
      await this.aiGenRepo.save({
        user: { id: userId } as AiUser,
        type: AiGenerationType.DOCUMENT,
        prompt: prompt,
        result: result,
        title: `${type.toUpperCase()} Doc: ${prompt.substring(0, 20)}...`,
      });
    }

    return result;
  }

  async applyWatermark(imageUrl: string, isPremium: boolean): Promise<string> {
    if (isPremium) {
      return imageUrl; // No watermark for premium
    }
    // Mock watermark logic
    return `${imageUrl}&watermark=hipster_studio`;
  }
}
