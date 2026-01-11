import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiUser } from './entities/ai-user.entity';

import OpenAI from 'openai';

@Injectable()
export class AiService {
  private openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(AiUser)
    private readonly aiUserRepo: Repository<AiUser>,
  ) {
    // TODO: Move key to .env variable for security in production
    this.openai = new OpenAI({
      apiKey: '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',
    });
  }

  async getAiUserWithProfile(id: number) {
    return this.aiUserRepo.findOne({
      where: { id },
      relations: ['aiProfile'],
    });
  }

  async chat(messages: any[]): Promise<string> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: messages,
      });
      return completion.choices[0].message.content || '';
    } catch (error) {
      console.error('OpenAI Chat Error:', error);
      throw new Error('Erreur lors de la communication avec l\'IA.');
    }
  }

  async generateText(
    prompt: string,
    type: string,
  ): Promise<string> {
    const systemPrompt = `You are an expert copywriter for ${type} content.`;
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ];
    
    return this.chat(messages);
  }

  async generateImage(
    prompt: string,
    style: 'realistic' | 'cartoon' | 'sketch',
  ): Promise<string> {
    // Mock implementation - replace with Midjourney/DALL-E API call
    // Returning a placeholder image URL
    return `https://via.placeholder.com/1024x1024.png?text=${encodeURIComponent(prompt)}+(${style})`;
  }

  async generateDocument(
    type: 'legal' | 'business',
    params: any,
  ): Promise<string> {
    const prompt = `Generate a ${type} document with these parameters: ${JSON.stringify(params)}`;
    return this.generateText(prompt, 'business'); // Re-use text generation for now
  }

  async applyWatermark(imageUrl: string, isPremium: boolean): Promise<string> {
    if (isPremium) {
      return imageUrl; // No watermark for premium
    }
    // Mock watermark logic
    return `${imageUrl}&watermark=hipster_studio`;
  }
}
