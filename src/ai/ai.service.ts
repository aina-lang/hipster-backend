import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as NodeFormData from 'form-data';
import * as sharp from 'sharp';
import { AiUser, PlanType } from './entities/ai-user.entity';
import {
  AiGeneration,
  AiGenerationType,
} from './entities/ai-generation.entity';
import { deleteFile } from '../common/utils/file.utils';

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAI;
  private readonly openAiKey: string;

  constructor(
    private configService: ConfigService,
    @InjectRepository(AiUser)
    private aiUserRepo: Repository<AiUser>,
    @InjectRepository(AiGeneration)
    private aiGenRepo: Repository<AiGeneration>,
  ) {
    this.openAiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.openai = new OpenAI({
      apiKey: this.openAiKey,
    });
  }

  async onModuleInit() {
    this.logger.log(
      '[AiService] Initializing database schema for conversations...',
    );
    try {
      const queryRunner = this.aiGenRepo.manager.connection.createQueryRunner();

      // Check if conversationId column exists
      const hasColumn = await queryRunner.hasColumn(
        'ai_generations',
        'conversationId',
      );

      if (!hasColumn) {
        this.logger.log(
          '[AiService] Adding conversationId column to ai_generations...',
        );
        await queryRunner.query(
          `ALTER TABLE ai_generations ADD COLUMN conversationId VARCHAR(255) NULL`,
        );
        await queryRunner.query(
          `CREATE INDEX idx_ai_generations_conversationId ON ai_generations(conversationId)`,
        );
        this.logger.log('[AiService] SUCCESS - conversationId column added');
      } else {
        this.logger.log('[AiService] verified: conversationId column exists');
      }

      // Update existing NULL records with UUID
      const nullRecords = await this.aiGenRepo.find({
        where: { conversationId: null as any },
      });

      if (nullRecords.length > 0) {
        this.logger.log(
          `[AiService] Found ${nullRecords.length} old records without conversationId. Updating...`,
        );
        for (const record of nullRecords) {
          record.conversationId = uuidv4();
          await this.aiGenRepo.save(record);
        }
        this.logger.log(
          '[AiService] SUCCESS - All records now have a conversationId',
        );
      }

      await queryRunner.release();
    } catch (error) {
      this.logger.error(
        `[AiService] FATAL ERROR during conversationId initialization: ${error.message}`,
      );
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
    conversationId?: string,
  ) {
    try {
      // Generate conversationId if not provided (use generation id for API consistency)
      const finalConversationId = conversationId || uuidv4();

      const gen = this.aiGenRepo.create({
        user: { id: userId } as any,
        result,
        prompt,
        type,
        attributes,
        imageUrl,
        conversationId: finalConversationId,
        title: this.generateSmartTitle(prompt, type, attributes),
      });
      const saved = await this.aiGenRepo.save(gen);
      // Force-persist conversationId (workaround for MySQL/TypeORM column mapping)
      if (saved?.id) {
        const convId = conversationId || saved.id.toString();
        await this.aiGenRepo.update(
          { id: saved.id },
          { conversationId: convId },
        );
        saved.conversationId = convId;
      }
      return saved;
    } catch (error) {
      this.logger.error(`[saveGeneration] Error: ${error.message}`);
      return null;
    }
  }

  /**
   * Generate intelligent, meaningful titles for history items
   * Respects language and creates ChatGPT-like titles
   */
  private generateSmartTitle(
    prompt: string,
    type: AiGenerationType,
    attributes?: any,
  ): string {
    if (!prompt || prompt.trim().length === 0) {
      return 'Sans titre';
    }

    let textToProcess = prompt;

    // Detect if prompt is a JSON representation of chat messages
    if (prompt.trim().startsWith('[') || prompt.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(prompt);
        if (Array.isArray(parsed)) {
          // Find the first user message
          const firstUserMessage = parsed.find((m) => m.role === 'user');
          if (firstUserMessage && firstUserMessage.content) {
            textToProcess = firstUserMessage.content;
          } else if (parsed.length > 0 && parsed[0].content) {
            textToProcess = parsed[0].content;
          }
        } else if (parsed.prompt) {
          textToProcess = parsed.prompt;
        }
      } catch (e) {
        // Not valid JSON, continue with original prompt
      }
    }

    // Clean the prompt text
    const cleaned = textToProcess
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const maxLength = 60;

    // For different types, potentially customize behavior
    if (type === AiGenerationType.CHAT) {
      // Use first part of the message
      const substring = cleaned.substring(0, maxLength);
      return substring.length < cleaned.length ? substring + '...' : substring;
    }

    if (type === AiGenerationType.IMAGE) {
      // For images, prepend the style if available
      let title = cleaned.substring(0, maxLength);
      return title.length < cleaned.length ? title + '...' : title;
    }

    // Default: just use first part of prompt
    const substring = cleaned.substring(0, maxLength);
    return substring.length < cleaned.length ? substring + '...' : substring;
  }

  private readonly NEGATIVE_PROMPT =
    `extra fingers,mutated hands,six fingers,four fingers,extra limbs,detached limbs,missing limbs,fused fingers,deformed hands,cloned face,multiple heads,two heads,extra heads,distorted face,blurry,out of focus,low quality,pixelated,grain,lowres,text,watermark,logo,signature,letters,words,captions,labels,numbers,characters,symbols,typography,typesetting,advertisement text,cgi,3d,render,cartoon,anime,illustration,drawing,digital art,smooth plastic skin,artificial,airbrushed,unnatural skin,mustache,beard,facial hair,stubble,plastic,wax,doll,fake,unreal engine,octane render,oversaturated,high contrast,artificial lighting,porcelain,rubber,skin blemishes,distorted eyes,asymmetrical face,hyper-saturated,glowing edges,bad anatomy,bad proportions,amateur,draft,distorted facial features,plastic textures,oversmoothed skin,uncanny valley,oversaturated colors,multiple people,low resolution,photo-collage,heavy makeup,fake eyelashes,distorted gaze,airbrushed skin,digital over-sharpening,smooth plastic skin texture,perfectly symmetrical face,artificial CGI glow`.trim();

  private async refineSubject(job: string): Promise<string> {
    if (!job || job.trim().length === 0) return '';
    try {
      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Translate job to 2-3 word English visual subject. Reply ONLY the subject.',
          },
          { role: 'user', content: job },
        ],
        temperature: 0.1,
        max_tokens: 10,
      });
      const refined = resp.choices[0]?.message?.content?.trim() || job;
      this.logger.log(`[refineSubject] "${refined}"`);
      return refined;
    } catch (e) {
      this.logger.error(`[refineSubject] ${e.message}`);
      return job;
    }
  }

  private async refineQuery(
    query: string,
    job: string,
    styleName: string,
  ): Promise<{
    prompt: string;
    isPostureChange: boolean;
    accentColor?: string;
    lighting?: string;
    angle?: string;
    background?: string;
    primaryObject?: string;
  }> {
    try {
      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Image prompt engineer.Job="${job}" Style="${styleName}".Return JSON only:{"prompt":"short English scene(max 40 words)","isPostureChange":false,"accentColor":"deep red|burnt orange|electric purple|muted gold|royal blue|emerald green","lighting":"side dramatic|top cinematic|rim silhouette|split contrast|soft diffused","angle":"low|high|profile|three-quarter|front","background":"dark concrete|white studio|film grain|charcoal|grey gradient","primaryObject":"iconic object for job"}If user provides prompt,enhance it.No people unless asked.`,
          },
          { role: 'user', content: query || `Scene for ${job}` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 120,
      });
      const data = JSON.parse(resp.choices[0]?.message?.content || '{}');
      this.logger.log(`[refineQuery] ${JSON.stringify(data)}`);
      return {
        prompt: data.prompt || query,
        isPostureChange: !!data.isPostureChange,
        accentColor: data.accentColor,
        lighting: data.lighting,
        angle: data.angle,
        background: data.background,
        primaryObject: data.primaryObject,
      };
    } catch (e) {
      this.logger.error(`[refineQuery] ${e.message}`);
      return { prompt: query, isPostureChange: false };
    }
  }

  private getRandomItem(pool: string[]): string {
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private async refinePromptForOpenAiEdit(prompt: string): Promise<string> {
    // For Image Edit (I2I), the prompt should emphasize "Transforming the style to..."
    // We use GPT-4o-mini to ensure the prompt is optimized for a technical edit instruction.
    try {
      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a prompt engineer for OpenAI Image Edits. Transform the user input into a single, direct instruction in English that describes the FINAL look. Start with "Modify this image to have a [Style] aesthetic...". Remove technical tags like 8k or masterpiece. Keep it under 250 chars.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 150,
      });
      const refined = resp.choices[0]?.message?.content?.trim() || prompt;
      this.logger.log(`[refinePromptForOpenAiEdit] Refined: ${refined}`);
      return refined;
    } catch (e) {
      this.logger.error(`[refinePromptForOpenAiEdit] ${e.message}`);
      return prompt.substring(0, 1000);
    }
  }

  private getStyleDescription(
    styleName: string,
    job: string,
    options?: {
      accentColor?: string;
      lighting?: string;
      angle?: string;
      background?: string;
      primaryObject?: string;
    },
  ): string {
    const jobStr = job || 'professional';

    // Premium Style with randomized pools (New Spec)
    if (styleName === 'Premium') {
      const accent =
        options?.accentColor ||
        this.getRandomItem([
          'deep red',
          'burnt orange',
          'electric purple',
          'muted gold',
        ]);
      const lighting =
        options?.lighting ||
        this.getRandomItem(['side lighting dramatic', 'top light cinematic']);
      const angle =
        options?.angle ||
        this.getRandomItem(['slight low angle', 'three quarter view']);
      const bg =
        options?.background ||
        this.getRandomItem([
          'textured dark concrete background',
          'matte charcoal backdrop',
        ]);

      let professionalContext = '';
      if (options?.primaryObject) {
        professionalContext = `The scene prominently features a ${options.primaryObject} that belongs to the ${jobStr} world.`;
      }

      return `Ultra high contrast black white professional photo.High-end luxury editorial,sharp focus,cinematic. ${lighting},${angle},dramatic shadows,high-fidelity. ${bg}. ${professionalContext} RULES:No geometric shapes/lines/frames.PURE PHOTOGRAPHY.Single authentic photo.COLOR:Monochrome.ONE ACCENT:${accent} on key element.High-end campaign,luxury branding,clean studio.No text/logo/watermark.`
        .replace(/\s+/g, ' ')
        .trim();
    }

    if (styleName === 'Hero Studio') {
      return `Heroic cinematic studio shot centered on the subject. Dark premium background, dramatic lighting, sharp focus.`;
    }
    if (styleName === 'Minimal Studio') {
      return `Minimal clean studio shot centered on the subject. Soft natural light, clean white/neutral background, elegant composition.`;
    }

    return `Professional high-quality representation of ${jobStr}. Style: ${styleName}.`;
  }

  private async uploadToOpenAiFiles(image: Buffer): Promise<string> {
    try {
      const formData = new NodeFormData();
      formData.append('file', image, {
        filename: 'image.png',
        contentType: 'image/png',
      });
      // 'assistants' is the correct purpose for images used in edits/generations
      formData.append('purpose', 'assistants');

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

  /**
   * Appelle POST /v1/images/edits avec stream: true.
   * Attend l'événement `image_edit.completed` (ImageEditCompletedEvent) pour récupérer le b64_json final.
   */
  private async callOpenAiImageEdit(
    image: Buffer,
    prompt: string,
  ): Promise<Buffer> {
    try {
      this.logger.log(
        `[callOpenAiImageEdit] Starting streaming edit (gpt-image-1.5)`,
      );

      // 1. Resize & convert to PNG
      const pngBuffer = await sharp(image)
        .resize(1024, 1536, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .ensureAlpha()
        .png()
        .toBuffer();

      this.logger.log(
        `[callOpenAiImageEdit] Image optimized: ${(pngBuffer.length / 1024 / 1024).toFixed(2)} MB`,
      );

      // 3. Upload to OpenAI Files to get a file_id
      const fileId = await this.uploadToOpenAiFiles(pngBuffer);

      // 2. Refine prompt
      const refinedPrompt = await this.refinePromptForOpenAiEdit(prompt);

      // 4. POST with stream: true — receive SSE events using input_file_id
      const response = await axios.post(
        'https://api.openai.com/v1/images/edits',
        {
          model: 'gpt-image-1.5',
          prompt: refinedPrompt,
          images: [{ input_file_id: fileId }],
          size: '1024x1024',
          quality: 'medium',
          output_format: 'jpeg',
          moderation: 'low',
          input_fidelity: 'high',
          n: 1,
          stream: true,
          partial_images: 0,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.openAiKey}`,
          },
          responseType: 'stream',
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 300000,
        },
      );

      // 5. Parse SSE stream — wait for image_edit.completed
      return new Promise<Buffer>((resolve, reject) => {
        let buffer = '';
        response.data.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const raw = line.slice(5).trim();
            if (!raw || raw === '[DONE]') continue;
            try {
              const event = JSON.parse(raw);
              if (event.type === 'image_edit.completed') {
                const b64 = event.b64_json;
                if (!b64) {
                  reject(
                    new Error('[callOpenAiImageEdit] completed but no b64'),
                  );
                  return;
                }
                resolve(Buffer.from(b64, 'base64'));
              }
            } catch {
              /* ignore sse fragments */
            }
          }
        });
        response.data.on('error', (err) => reject(err));
        response.data.on('end', () =>
          reject(new Error('Stream ended without completion')),
        );
      });
    } catch (error) {
      if (error.response) {
        this.logger.error(
          `[callOpenAiImageEdit] 400 DETAIL: ${JSON.stringify(error.response.data)}`,
        );
      } else {
        this.logger.error(`[callOpenAiImageEdit] Error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Call POST /v1/images/generations avec stream: true.
   * Attend l'événement `image_generation.completed` (ImageGenCompletedEvent) pour récupérer le b64_json final.
   */
  private async callOpenAiToolImage(prompt: string): Promise<Buffer> {
    try {
      this.logger.log(
        `[callOpenAiToolImage] Generating with gpt-image-1.5 (streaming)...`,
      );
      const startTime = Date.now();

      const realismEnhancedPrompt =
        `${prompt} REALISM:Hyper-realistic-photo,natural-skin-texture,visible-pores,correct-anatomy,natural-light`
          .replace(/\s+/g, ' ')
          .trim();

      const response = await axios.post(
        'https://api.openai.com/v1/images/generations',
        {
          model: 'gpt-image-1.5',
          prompt: realismEnhancedPrompt,
          n: 1,
          size: '1024x1024',
          background: 'opaque',
          quality: 'medium',
          output_format: 'jpeg',
          moderation: 'low',
          stream: true,
          partial_images: 0,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.openAiKey}`,
          },
          responseType: 'stream',
          timeout: 400000,
        },
      );

      return new Promise<Buffer>((resolve, reject) => {
        let buffer = '';
        response.data.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const raw = line.slice(5).trim();
            if (!raw || raw === '[DONE]') continue;
            try {
              const event = JSON.parse(raw);
              if (event.type === 'image_generation.completed') {
                const b64 = event.b64_json;
                if (!b64) {
                  reject(new Error('No b64 in completion'));
                  return;
                }
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                this.logger.log(`[callOpenAiToolImage] SUCCESS in ${elapsed}s`);
                resolve(Buffer.from(b64, 'base64'));
              }
            } catch {
              /* ignore fragments */
            }
          }
        });
        response.data.on('error', (err) => reject(err));
        response.data.on('end', () =>
          reject(new Error('Stream ended without completion')),
        );
      });
    } catch (error) {
      this.logger.error(`[callOpenAiToolImage] Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Public test method for the OpenAI Tool image generation
   */
  async generateOpenAiTestImage(prompt: string, userId: number) {
    this.logger.log(
      `[generateOpenAiTestImage] START - User: ${userId}, Prompt: ${prompt}`,
    );

    try {
      const buffer = await this.callOpenAiToolImage(prompt);
      const fileName = `gen_openai_${Date.now()}.jpg`;
      const uploadPath = '/home/ubuntu/uploads/ai-generations';

      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      const filePath = path.join(uploadPath, fileName);
      fs.writeFileSync(filePath, buffer);

      const imageUrl = `https://hipster-api.fr/uploads/ai-generations/${fileName}`;

      const saved = await this.saveGeneration(
        userId,
        'OPENAI_TOOL_GENERATION',
        prompt,
        AiGenerationType.IMAGE,
        { engine: 'openai-tool', model: 'gpt-5' },
        imageUrl,
      );

      return {
        url: imageUrl,
        generationId: saved?.id,
      };
    } catch (error) {
      this.logger.error(`[generateOpenAiTestImage] FAILED: ${error.message}`);
      throw error;
    }
  }

  /**
   * Background processor for slow OpenAI Tool generations
   */
  private async processOpenAiToolImageBackground(
    generationId: number,
    prompt: string,
    userId: number,
    styleName: string,
  ) {
    this.logger.log(
      `[processOpenAiToolImageBackground] Started for Gen: ${generationId} (gpt-image-1.5)`,
    );

    try {
      const buffer = await this.callOpenAiToolImage(prompt);
      const fileName = `gen_final_${generationId}_${Date.now()}.jpg`;
      const uploadPath = '/home/ubuntu/uploads/ai-generations';

      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }

      const filePath = path.join(uploadPath, fileName);
      fs.writeFileSync(filePath, buffer);

      const imageUrl = `https://hipster-api.fr/uploads/ai-generations/${fileName}`;

      // Update the record with the final image
      await this.aiGenRepo.update(generationId, {
        imageUrl,
        result: 'OPENAI_TOOL_TEXT_TO_IMAGE',
        attributes: {
          engine: 'openai-tool',
          model: 'gpt-image-1.5',
          style: styleName,
          async: true,
          completedAt: new Date().toISOString(),
        },
      } as any);

      this.logger.log(
        `[processOpenAiToolImageBackground] SUCCESS - Gen: ${generationId}, URL: ${imageUrl}`,
      );
    } catch (error) {
      this.logger.error(
        `[processOpenAiToolImageBackground] FAILED for Gen: ${generationId} - ${error.message}`,
      );
      await this.aiGenRepo.update(generationId, {
        result: `ERROR: ${error.message}`,
      } as any);
    }
  }

  /* --------------------- IMAGE GENERATION --------------------- */
  async generateImage(
    params: any,
    style: string,
    userId: number,
    file?: Express.Multer.File,
    seed?: number,
    existingConversationId?: string,
  ) {
    const defaultStyle = 'Hero Studio';
    const styleName = style || params.style || defaultStyle;

    this.logger.log(
      `[generateImage] START - User: ${userId}, hasFile: ${!!file}, Style: ${styleName}, Job: ${params.job}`,
    );

    let refinedSubject = '';
    if (params.job && params.job.length > 0) {
      refinedSubject = await this.refineSubject(params.job);
    }

    const userQuery = (params.userQuery || '').trim();

    let refinedQuery = userQuery;
    let isPostureChange = false;
    let styleOptions: any = {};

    // Enable GPT-powered prompt expansion for ALL modes (with or without image)
    // Now always refinement to get contextually aware style options (color, object, etc.)
    const refinedData = await this.refineQuery(
      userQuery,
      refinedSubject,
      styleName,
    );
    refinedQuery = refinedData.prompt;
    isPostureChange = refinedData.isPostureChange;
    styleOptions = {
      accentColor: refinedData.accentColor,
      lighting: refinedData.lighting,
      angle: refinedData.angle,
      background: refinedData.background,
      primaryObject: refinedData.primaryObject,
    };

    const baseStylePrompt = this.getStyleDescription(
      styleName,
      refinedSubject,
      styleOptions,
    );

    try {
      let finalBuffer: Buffer;

      const qualityTags =
        'masterpiece,high quality,photorealistic,8k,detailed skin,sharp focus,natural lighting,cinematic,realistic hair';

      // Build the final prompt by combining the base style guide with the refined query.
      const promptBody = refinedQuery
        ? `${refinedQuery}. Aesthetic: ${baseStylePrompt}.`
        : baseStylePrompt;

      // REALISM BOOST: Inject hyper-realistic photography triggers
      const realismTriggers =
        'photorealistic,8k,detailed skin,pores,imperfections,film grain,natural lighting,candid,sharp focus eyes,35mm,f/1.8.NO plastic,NO CGI'.trim();

      const finalPrompt = `STYLE: ${styleName}. ${promptBody} QUALITY: ${realismTriggers} ${qualityTags}`;

      let finalNegativePrompt = this.NEGATIVE_PROMPT;

      // Additional specific filters for high-end styles
      if (
        styleName.toLowerCase().includes('premium') ||
        styleName.toLowerCase().includes('hero')
      ) {
        finalNegativePrompt = `${finalNegativePrompt},glitch,noise,low contrast,oversaturated,distorted face,mismatched eyes`;
      }

      if (styleName.toLowerCase().includes('monochrome')) {
        finalNegativePrompt = `${finalNegativePrompt},geometric shapes,lines,rectangles,squares,triangles,frames,grids,borders`;
      }

      if (file) {
        // OPENAI IMAGE EDIT (I2I)
        this.logger.log(
          `[generateImage] Strategy: OpenAI Image Edit (gpt-image-1.5) - from uploaded file`,
        );
        finalBuffer = await this.callOpenAiImageEdit(file.buffer, finalPrompt);
      } else if (
        params.reference_image &&
        typeof params.reference_image === 'string' &&
        params.reference_image.startsWith('http')
      ) {
        // DOWNLOAD REMOTE IMAGE FOR EDIT
        this.logger.log(
          `[generateImage] Strategy: OpenAI Image Edit (gpt-image-1.5) - from remote URL: ${params.reference_image}`,
        );
        try {
          const downloadResp = await axios.get(params.reference_image, {
            responseType: 'arraybuffer',
          });
          const downloadedBuffer = Buffer.from(downloadResp.data);
          finalBuffer = await this.callOpenAiImageEdit(
            downloadedBuffer,
            finalPrompt,
          );
        } catch (downloadError) {
          this.logger.error(
            `[generateImage] Failed to download remote reference image: ${downloadError.message}`,
          );
          // Fallback to text-to-image or throw? Let's throw to be clear about the failure.
          throw new Error(
            "Impossible de charger l'image de référence distante.",
          );
        }
      } else {
        // EXCLUSIVE OPENAI GPT-5 TOOL TEXT-TO-IMAGE (RESTORED ASYNC)
        this.logger.log(
          `[generateImage] Strategy: OpenAI GPT-5 (ASYNC REALISM)`,
        );

        // 1. Create a PENDING record immediately
        const pendingGen = await this.saveGeneration(
          userId,
          'PENDING',
          finalPrompt,
          AiGenerationType.CHAT,
          {
            engine: 'openai-tool',
            model: 'gpt-5',
            async: true,
            style: styleName,
          },
          undefined,
          existingConversationId,
        );

        // 2. Process in background without awaiting (Realism focus in process helper)
        this.processOpenAiToolImageBackground(
          pendingGen.id,
          finalPrompt,
          userId,
          styleName,
        );

        // 3. Return immediately with isAsync flag
        return {
          id: pendingGen.id,
          generationId: pendingGen.id,
          conversationId: existingConversationId || String(pendingGen.id),
          url: null,
          isAsync: true,
          status: 'PENDING',
          prompt: finalPrompt,
        };
      }

      const fileName = `gen_${Date.now()}.jpg`;
      const uploadPath = '/home/ubuntu/uploads/ai-generations';
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }

      const filePath = path.join(uploadPath, fileName);
      fs.writeFileSync(filePath, finalBuffer);

      const imageUrl = `https://hipster-api.fr/uploads/ai-generations/${fileName}`;

      const saved = await this.saveGeneration(
        userId,
        file ? 'OPENAI_IMAGE_EDIT' : 'OPENAI_TOOL_TEXT_TO_IMAGE',
        JSON.stringify([
          { role: 'user', content: finalPrompt },
          { role: 'assistant', content: "Voici l'image générée" },
        ]),
        AiGenerationType.CHAT,
        {
          style: styleName,
          seed,
          hasSourceImage: !!file,
        },
        imageUrl,
        existingConversationId,
      );

      this.logger.log(`[generateImage] SUCCESS - URL: ${imageUrl}`);
      return {
        url: imageUrl,
        generationId: saved?.id,
        conversationId: existingConversationId || saved?.id.toString(),
        seed: seed || 0,
        prompt: finalPrompt,
      };
    } catch (error) {
      this.logger.error(`[generateImage] FAILED: ${error.message}`);
      throw error;
    }
  }

  async generateFreeImage(
    params: any,
    userId: number,
    seed?: number,
    existingConversationId?: string,
    file?: Express.Multer.File,
  ) {
    this.logger.log(
      `[generateFreeImage] START - User: ${userId}, Prompt: ${params.prompt || params.query}`,
    );
    try {
      // Call generateImage with the optional file
      const result = await this.generateImage(
        {
          userQuery: params.prompt || params.query || '',
          style: params.style || 'photographic',
          job: params.subject || '', // Optional: for refined subject description
        },
        params.style || 'photographic',
        userId,
        file, // Pass the file through
        seed,
        existingConversationId,
      );

      this.logger.log(`[generateFreeImage] SUCCESS - URL: ${result.url}`);
      return result;
    } catch (error) {
      this.logger.error(`[generateFreeImage] Error: ${error.message}`);
      throw error;
    }
  }

  async generateText(
    params: any,
    type: string,
    userId: number,
    existingConversationId?: string,
  ) {
    this.logger.log(
      `[generateText] START - User: ${userId}, Type: ${type}, Params: ${JSON.stringify(params)}`,
    );
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Professional ${type} writer.French only.Plain text,no markdown.Short & direct.LOGIC:1.If user specifically asks for a caption/text content,follow those instructions.2.If user DOES NOT ask for text,IGNORE the "imagePrompt" details and INVENT an impactful marketing post related to the "job" context.3.NEVER describe the image details (lighting,lens,etc.) unless the user explicitly asks "Décris cette image".4.Focus on professional value and high-end branding.STYLE:Professional,telegraphic,impactful.`,
          },
          {
            role: 'user',
            content: `${type}: ${JSON.stringify(params)}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 600,
        n: 1,
      });
      const result = response.choices[0]?.message?.content || '';

      // Map sub-types (social, blog, ad, etc.) to valid base enum
      const validBaseTypes = Object.values(AiGenerationType) as string[];
      let baseType = AiGenerationType.TEXT;

      if (validBaseTypes.includes(type)) {
        baseType = type as AiGenerationType;
      }

      const saved = await this.saveGeneration(
        userId,
        result,
        JSON.stringify([
          {
            role: 'user',
            content:
              params.job ||
              params.topic ||
              params.userQuery ||
              'Génération de texte',
          },
          { role: 'assistant', content: result },
        ]),
        AiGenerationType.CHAT,
        {
          ...params,
          subType: type,
        },
        undefined,
        existingConversationId,
      );
      this.logger.log(
        `[generateText] SUCCESS - Generated ${result.length} chars, ID: ${saved?.id}`,
      );
      return {
        content: result,
        generationId: saved?.id,
        conversationId: saved?.id.toString(),
      };
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
      `[generateSocial] START - User: ${userId}, hasFile: ${!!file}, Job: "${params.job}"`,
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
    // We include the 'imagePrompt' from generateImage to help the text IA describe the scene
    const { style: _, ...textParams } = params;
    const textRes = await this.generateText(
      { ...textParams, brandingInfo, imagePrompt: imageRes.prompt },
      'social',
      userId,
    );

    const result = {
      image: imageRes.url || '',
      text: textRes.content || '',
      generationId: imageRes.id || imageRes.generationId,
      isAsync: !!imageRes.isAsync,
    };

    this.logger.log(
      `[generateSocial] SUCCESS - Image: ${result.image || 'NONE'}, Text Length: ${result.text.length}, Async: ${result.isAsync}`,
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
    return { ...result, url: result.url, isAsync: !!result.isAsync };
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
      const result = await this.aiGenRepo.find({
        where: { user: { id: userId } },
        order: { createdAt: 'DESC' },
        take: 50,
      });
      this.logger.log(
        `[getHistory] Retrieved ${result.length} items for user ${userId}`,
      );
      return result;
    } catch (error) {
      this.logger.error(`[getHistory] Error: ${error.message}`);
      return [];
    }
  }

  async getGroupedConversations(userId: number) {
    try {
      // Get all chats ordered by creation date desc
      const allItems = await this.aiGenRepo.find({
        where: { user: { id: userId }, type: AiGenerationType.CHAT },
        order: { createdAt: 'DESC' },
        take: 100,
      });

      // Group by conversationId or create groups for items without one
      const conversationMap = new Map<string, any>();

      allItems.forEach((item) => {
        // Group by conversationId, or treat each item as standalone if null
        const key = item.conversationId ?? `standalone_${item.id}`;

        if (!conversationMap.has(key)) {
          conversationMap.set(key, {
            // Use conversationId when present, else use ai_generation id for load/delete
            id: item.conversationId ?? String(item.id),
            title: item.title,
            date: item.createdAt,
            count: 0,
            items: [],
          });
        }

        const conversation = conversationMap.get(key);
        // For CHAT type, count messages in prompt (user+assistant) for accurate preview
        let msgCount = 1;
        if (item.type === AiGenerationType.CHAT && item.prompt) {
          try {
            const parsed = JSON.parse(item.prompt);
            if (Array.isArray(parsed)) {
              msgCount = parsed.filter(
                (m: any) => m.role === 'user' || m.role === 'assistant',
              ).length;
            }
          } catch {
            msgCount = 1;
          }
        }
        conversation.count += msgCount;
        conversation.items.push({
          id: item.id,
          type: item.type,
          title: item.title,
          date: item.createdAt,
          imageUrl: item.imageUrl,
        });
      });

      // Convert to array and sort by latest date
      const conversations = Array.from(conversationMap.values()).sort(
        (a, b) => {
          return (
            new Date(b.items[0]?.date || b.date).getTime() -
            new Date(a.items[0]?.date || a.date).getTime()
          );
        },
      );

      this.logger.log(
        `[getGroupedConversations] Retrieved ${conversations.length} conversations for user ${userId}`,
      );
      return conversations;
    } catch (error) {
      this.logger.error(`[getGroupedConversations] Error: ${error.message}`);
      return [];
    }
  }

  async getConversation(idOrConversationId: number | string, userId: number) {
    this.logger.log(
      `[getConversation] Loading ID: ${idOrConversationId} for User: ${userId}`,
    );
    try {
      const where: any = { user: { id: userId } };
      if (
        typeof idOrConversationId === 'string' &&
        idOrConversationId.includes('-')
      ) {
        // UUID: find all records for this conversation
        where.conversationId = idOrConversationId;
        const items = await this.aiGenRepo.find({
          where,
          order: { createdAt: 'DESC' },
        });

        // Favor CHAT type which contains the full history
        const chatItem = items.find((i) => i.type === AiGenerationType.CHAT);
        if (chatItem) {
          this.logger.log(
            `[getConversation] FOUND - CHAT record for UUID: ${idOrConversationId}`,
          );
          return chatItem;
        }
        this.logger.log(
          `[getConversation] FOUND - ${items.length} records (no CHAT type) for UUID: ${idOrConversationId}`,
        );
        return items[0] || null;
      } else {
        // Numeric: find by record id
        where.id =
          typeof idOrConversationId === 'number'
            ? idOrConversationId
            : parseInt(String(idOrConversationId), 10);
        const item = await this.aiGenRepo.findOne({ where });
        if (item) {
          this.logger.log(
            `[getConversation] FOUND - Record ID: ${item.id} (Type: ${item.type})`,
          );
        } else {
          this.logger.warn(
            `[getConversation] NOT FOUND - ID: ${idOrConversationId}`,
          );
        }
        return item;
      }
    } catch (error) {
      this.logger.error(`[getConversation] ERROR: ${error.message}`);
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

  async deleteGeneration(id: number | string, userId: number) {
    this.logger.log(`[deleteGeneration] START - ID: ${id}, UserID: ${userId}`);
    try {
      let toDelete: AiGeneration[] = [];
      if (typeof id === 'string' && id.includes('-')) {
        // UUID: find all records with this conversationId (chat + images in same conversation)
        toDelete = await this.aiGenRepo.find({
          where: { conversationId: id, user: { id: userId } },
          relations: ['user'],
        });
      } else {
        const numId = typeof id === 'number' ? id : parseInt(String(id), 10);
        if (!isNaN(numId)) {
          const gen = await this.aiGenRepo.findOne({
            where: { id: numId, user: { id: userId } },
            relations: ['user'],
          });
          if (gen) {
            // Delete the whole conversation: if record has conversationId, delete ALL with same conversationId
            if (gen.conversationId) {
              toDelete = await this.aiGenRepo.find({
                where: {
                  conversationId: gen.conversationId,
                  user: { id: userId },
                },
                relations: ['user'],
              });
            } else {
              toDelete = [gen];
            }
          }
        }
      }

      if (toDelete.length === 0) {
        this.logger.warn(
          `[deleteGeneration] Not found or unauthorized. ID: ${id}, User: ${userId}`,
        );
        return { success: false, message: 'Génération non trouvée' };
      }

      for (const gen of toDelete) {
        this.logger.log(
          `[deleteGeneration] Cleaning files for Item ID: ${gen.id} (Type: ${gen.type})`,
        );
        if (gen.imageUrl) {
          this.logger.log(`[deleteGeneration] -> imageUrl: ${gen.imageUrl}`);
          deleteFile(gen.imageUrl);
        }
        if (gen.fileUrl) {
          this.logger.log(`[deleteGeneration] -> fileUrl: ${gen.fileUrl}`);
          deleteFile(gen.fileUrl);
        }
      }
      await this.aiGenRepo.remove(toDelete);
      this.logger.log(
        `[deleteGeneration] SUCCESS - Deleted ${toDelete.length} item(s) from database for user ${userId}`,
      );
      return { success: true };
    } catch (error) {
      this.logger.error(`[deleteGeneration] FATAL ERROR: ${error.message}`);
      throw error;
    }
  }

  async clearHistory(userId: number) {
    this.logger.log(`[clearHistory] START - UserID: ${userId}`);
    try {
      const generations = await this.aiGenRepo.find({
        where: { user: { id: userId } },
      });

      this.logger.log(
        `[clearHistory] Found ${generations.length} items to delete`,
      );

      // Delete all associated files
      for (const gen of generations) {
        if (gen.imageUrl) deleteFile(gen.imageUrl);
        if (gen.fileUrl) deleteFile(gen.fileUrl);
      }

      await this.aiGenRepo.remove(generations);
      this.logger.log(
        `[clearHistory] SUCCESS - Cleared all items for user ${userId}`,
      );
      return { success: true };
    } catch (error) {
      this.logger.error(`[clearHistory] FATAL ERROR: ${error.message}`);
      throw error;
    }
  }

  async refineText(text: string) {
    return { content: text };
  }

  async chat(
    messages: any[],
    userId: number,
    conversationId?: string,
    file?: Express.Multer.File,
  ) {
    // Modern apps pattern: conversationId is stable (UUID from client or legacy numeric id)
    const finalConversationId = conversationId || uuidv4();

    this.logger.log(
      `[chat] START - User: ${userId}, Messages: ${messages.length}, ConversationId: ${finalConversationId}, HasFile: ${!!file}`,
    );
    try {
      // 1. Load existing conversation by conversationId (supports UUID and legacy numeric id)
      let conversation: AiGeneration | null = null;
      if (conversationId) {
        if (conversationId.includes('-')) {
          // UUID: find by conversationId
          conversation = await this.aiGenRepo.findOne({
            where: { conversationId, user: { id: userId } },
          });
        } else {
          // Legacy numeric: find by id (conversationId = record id)
          const numId = parseInt(conversationId, 10);
          if (!isNaN(numId)) {
            conversation = await this.aiGenRepo.findOne({
              where: { id: numId, user: { id: userId } },
            });
          }
        }
      }

      // Get the last user message to detect request type
      const lastUserMessage =
        messages
          .slice()
          .reverse()
          .find((m) => m.role === 'user')?.content || '';

      this.logger.log(`[chat] Last message: "${lastUserMessage}"`);

      // Detect if user is requesting an image (or if they provided a file)
      let requestType = await this.detectChatRequestType(
        lastUserMessage,
        !!file,
      );

      // Handle Vision (Analysis) if a file is present and intent is to analyze
      if (file && requestType === 'analyze') {
        this.logger.log('[chat] Vision analysis detected...');

        // Save file locally to provide a URL (user requested NO base64)
        const fileName = `vision_${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`;
        const uploadPath = '/home/ubuntu/uploads/chat-visions';
        if (!fs.existsSync(uploadPath))
          fs.mkdirSync(uploadPath, { recursive: true });
        const filePath = path.join(uploadPath, fileName);
        fs.writeFileSync(filePath, file.buffer);

        const imageUrl = `https://hipster-api.fr/uploads/chat-visions/${fileName}`;

        const promptSummary = lastUserMessage || 'Analyze this image.';

        const visionResponse = await this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'Expert visual analyzer.French only.Style:telegraphic.Direct & short.Focus on professional context.',
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: promptSummary },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageUrl,
                    detail: 'low', // Minimize tokens as requested
                  },
                },
              ],
            },
          ],
          max_tokens: 300,
          temperature: 0.2,
          n: 1,
        });

        const visionContent = visionResponse.choices[0]?.message?.content || '';

        // Persist
        const visionMessages = [
          ...messages,
          {
            role: 'assistant',
            content: visionContent,
            type: 'text',
          },
        ];

        await this.saveGeneration(
          userId,
          visionContent,
          JSON.stringify(visionMessages),
          AiGenerationType.CHAT,
          { hasVision: true, imageUrl },
          undefined,
          finalConversationId,
        );

        return {
          type: 'text',
          content: visionContent,
          conversationId: finalConversationId,
        };
      }

      if (requestType === 'image') {
        this.logger.log('[chat] Image generation detected, generating...');
        // Generate image from user prompt
        const imageResult = await this.generateFreeImage(
          { prompt: lastUserMessage },
          userId,
          undefined,
          finalConversationId, // Pass the conversation ID
          file, // Pass the uploaded file
        );

        // If imageResult already created/updated a record, we just need to return it
        const conversationIdToReturn =
          imageResult.conversationId || imageResult.generationId.toString();

        const savedMessages = [...messages];
        if (imageResult.url) {
          savedMessages.push({
            role: 'assistant',
            content: "Voici l'image générée",
            type: 'image',
            url: imageResult.url,
          });
        } else if (imageResult.isAsync) {
          savedMessages.push({
            role: 'assistant',
            content: 'Image en cours de génération...',
            type: 'image',
            isAsync: true,
            generationId: imageResult.generationId,
          });
        }

        // Final update to ensure prompt history is complete in the record
        if (conversationIdToReturn) {
          await this.aiGenRepo.update(
            { conversationId: conversationIdToReturn, user: { id: userId } },
            { prompt: JSON.stringify(savedMessages) },
          );
        }

        // Check if generation is async
        if (imageResult.isAsync) {
          return {
            type: 'image',
            content: `Image en cours de génération...`,
            url: null,
            generationId: imageResult.generationId,
            conversationId: conversationIdToReturn,
            isAsync: true,
          };
        }

        // Download the image and convert it to base64 (sync response only)
        let imageData = '';
        try {
          const resp = await axios.get(imageResult.url, {
            responseType: 'arraybuffer',
          });
          imageData = Buffer.from(resp.data).toString('base64');
        } catch (e) {
          this.logger.error(`[chat] Failed to download image: ${e.message}`);
          imageData = imageResult.url;
        }

        return {
          type: 'image',
          content: `Voici l'image générée`,
          imageBase64: imageData,
          generationId: imageResult.generationId,
          conversationId: conversationIdToReturn,
        };
      }

      // 2. Otherwise, generate text response
      this.logger.log('[chat] Text response generation...');

      // Inject professional system constraints for efficiency (user's UX request)
      const systemMessage = {
        role: 'system',
        content:
          'Expert branding assistant.French only.Style:telegraphic.Direct & concise.NO long lists.Respond < 100 words.',
      };

      const hasSystem = messages.some((m) => m.role === 'system');
      const finalChatMessages = hasSystem
        ? messages
        : [systemMessage, ...messages];

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: finalChatMessages as any[],
        temperature: 0.3,
        max_tokens: 1000,
        n: 1,
      });

      const content = response.choices[0]?.message?.content || '';

      // 3. Persist the updated conversation
      const finalMessages = [...messages, { role: 'assistant', content }];

      if (conversation) {
        // UPDATE existing: same conversationId for the whole thread
        conversation.prompt = JSON.stringify(finalMessages);
        conversation.result = content;
        conversation.conversationId = finalConversationId;
        await this.aiGenRepo.save(conversation);
        await this.aiGenRepo.update(
          { id: conversation.id },
          { conversationId: finalConversationId },
        );
      } else {
        // CREATE new: use the stable conversationId from client
        const title = this.generateSmartTitle(
          lastUserMessage,
          AiGenerationType.CHAT,
        );
        conversation = this.aiGenRepo.create({
          user: { id: userId } as any,
          type: AiGenerationType.CHAT,
          prompt: JSON.stringify(finalMessages),
          result: content,
          title,
          conversationId: finalConversationId,
        });
        conversation = await this.aiGenRepo.save(conversation);
        await this.aiGenRepo.update(
          { id: conversation.id },
          { conversationId: finalConversationId },
        );
      }

      // Always return the same conversationId (never a new one)
      const returnedConvId = finalConversationId;
      return {
        type: 'text',
        content: content,
        conversationId: returnedConvId,
      };
    } catch (error) {
      this.logger.error(`[chat] Error: ${error.message}`);
      throw error;
    }
  }

  private async detectChatRequestType(
    message: string,
    hasFile: boolean,
  ): Promise<'image' | 'analyze' | 'text'> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Classify user intent.Reply ONLY one word:"image":generate/edit new visual."analyze":question about uploaded image."text":general conversation.Context:User has ${hasFile ? '' : 'NOT '}uploaded file.`,
          },
          {
            role: 'user',
            content: message || (hasFile ? 'Analyze this image' : 'Hello'),
          },
        ],
        temperature: 0,
        max_tokens: 10,
        n: 1,
      });

      const result = response.choices[0]?.message?.content
        ?.trim()
        .toLowerCase();
      if (result === 'image') return 'image';
      if (result === 'analyze') return 'analyze';
      return 'text';
    } catch (error) {
      this.logger.error(`[detectChatRequestType] ${error.message}`);
      return hasFile ? 'analyze' : 'text';
    }
  }
}
