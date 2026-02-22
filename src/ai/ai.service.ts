import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

@Injectable()
export class AiService {
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
    existingId?: number,
  ) {
    try {
      let gen: AiGeneration;
      if (existingId) {
        gen = await this.aiGenRepo.findOne({ where: { id: existingId } });
        if (gen) {
          gen.result = result;
          gen.prompt = prompt;
          gen.imageUrl = imageUrl || gen.imageUrl;
          gen.attributes = attributes;
        } else {
          gen = this.aiGenRepo.create({
            user: { id: userId } as any,
            result,
            prompt,
            type:
              type === AiGenerationType.TEXT || type === AiGenerationType.IMAGE
                ? AiGenerationType.CHAT
                : type,
            attributes,
            imageUrl,
            title: this.generateSmartTitle(prompt, type, attributes),
          });
        }
      } else {
        gen = this.aiGenRepo.create({
          user: { id: userId } as any,
          result,
          prompt,
          type:
            type === AiGenerationType.TEXT || type === AiGenerationType.IMAGE
              ? AiGenerationType.CHAT
              : type,
          attributes,
          imageUrl,
          title: this.generateSmartTitle(prompt, type, attributes),
        });
      }
      return await this.aiGenRepo.save(gen);
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

    // Clean the prompt text
    const cleaned = prompt.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
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
      if (attributes?.style) {
        // Don't prepend style here, just use the prompt naturally
        // Style is in attributes anyway
      }
      return title.length < cleaned.length ? title + '...' : title;
    }

    if (type === AiGenerationType.TEXT) {
      // Use the query/prompt directly
      const substring = cleaned.substring(0, maxLength);
      return substring.length < cleaned.length ? substring + '...' : substring;
    }

    // Default: just use first part of prompt
    const substring = cleaned.substring(0, maxLength);
    return substring.length < cleaned.length ? substring + '...' : substring;
  }

  private readonly NEGATIVE_PROMPT = `
    extra fingers, mutated hands, six fingers, four fingers, 
    extra limbs, detached limbs, missing limbs, fused fingers, deformed hands, 
    cloned face, multiple heads, two heads, extra heads, distorted face, 
    blurry, out of focus, low quality, pixelated, grain, lowres, 
    text, watermark, logo, signature, letters, words, captions, labels,
    numbers, characters, symbols, typography, typesetting, advertisement text, 
    cgi, 3d, render, cartoon, anime, illustration, drawing, digital art,
    smooth plastic skin, artificial, airbrushed, unnatural skin,
    mustache, beard, facial hair, stubble (unless specified),
    plastic, wax, doll, fake, unreal engine, octane render, oversaturated, 
    high contrast, artificial lighting, porcelain, rubber, skin blemishes, 
    distorted eyes, asymmetrical face, hyper-saturated, glowing edges,
    vibrant neon colors (unless specified), bad anatomy, bad proportions,
    amateur, draft, distorted facial features, plastic textures, oversmoothed skin,
    uncanny valley, oversaturated colors, multiple people, low resolution, 
    photo-collage, heavy makeup, fake eyelashes, distorted gaze,
    airbrushed skin, digital over-sharpening, smooth plastic skin texture,
    perfectly symmetrical face, artificial CGI glow.
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
      const accentColors = [
        'deep red',
        'burnt orange',
        'electric purple',
        'muted gold',
        'royal blue',
        'emerald green',
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
        'front view centered',
      ];
      const backgrounds = [
        'textured dark concrete background',
        'minimal white seamless studio',
        'grainy film texture',
        'matte charcoal backdrop',
        'soft gradient grey background',
      ];

      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert image prompt engineer for a luxury professional branding tool.
            Your goal is to choose the most contextually relevant visual style and professional objects for a given job and user request.
            
            CONTEXT:
            - Job: "${job}"
            - Style: "${styleName}"
            
            ASSIGNMENT:
            1. PRIMARY OBJECT: Identify a single, iconic professional object relevant to "${job}" (e.g., "vintage espresso machine" for a barista, "stethoscope" for a doctor, "luxury sports car" for a chauffeur).
            2. ACCENT COLOR: Pick one from: ${accentColors.join(', ')}.
            3. LIGHTING: Pick one from: ${lightings.join(', ')}.
            4. ANGLE: Pick one from: ${angles.join(', ')}.
            5. BACKGROUND: Pick one from: ${backgrounds.join(', ')}.
            6. PROMPT EXPANSION & STRICT ADHERENCE:
               - If the user provides a specific prompt, follow it EXCLUSIVELY. Enhance the visual detail but DO NOT ADD ANY PEOPLE, HANDS, OR HUMAN FIGURES unless specifically mentioned in their text.
               - If the user provides NO prompt, invent a descriptive, cinematic professional scene featuring the PRIMARY OBJECT or a typical workspace for "${job}". This scene can include a professional if it's the most natural way to represent the job, but focus on the environment.
               - Apply the characteristics of "${styleName}" (lighting, mood) without mentioning its name.
            
            OUTPUT FORMAT: Return ONLY a JSON object:
            {
              "prompt": "expanded English prompt focusing on the visual scene",
              "isPostureChange": boolean,
              "accentColor": "selected color",
              "lighting": "selected lighting",
              "angle": "selected angle",
              "background": "selected background",
              "primaryObject": "short description of the professional object identified"
            }`,
          },
          {
            role: 'user',
            content: query || `Describe a professional scene for a ${job}`,
          },
        ],
        response_format: { type: 'json_object' },
      });
      const data = JSON.parse(resp.choices[0]?.message?.content || '{}');
      this.logger.log(`[refineQuery] Result: ${JSON.stringify(data)}`);
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
      this.logger.error(`[refineQuery] Error: ${e.message}`);
      return { prompt: query, isPostureChange: false };
    }
  }

  private getRandomItem(pool: string[]): string {
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * Shortens a prompt for OpenAI Image Edit API (max 1000 chars)
   * uses ChatGPT as requested to maintain context.
   */
  private async refinePromptForOpenAiEdit(prompt: string): Promise<string> {
    if (prompt.length <= 1000) return prompt;

    this.logger.log(
      `[refinePromptForOpenAiEdit] Prompt too long (${prompt.length}). Summarizing...`,
    );

    try {
      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an expert prompt engineer. Shorten the following image generation prompt to be under 1000 characters.
            Keep all essential visual elements, subject details, .
            Optimize for quality and detail within the limit. 
            Respond with ONLY the condensed prompt text.`,
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 400,
      });

      const compressed = resp.choices[0]?.message?.content?.trim() || prompt;
      this.logger.log(
        `[refinePromptForOpenAiEdit] Compressed length: ${compressed.length}`,
      );
      return compressed.substring(0, 1000);
    } catch (e) {
      this.logger.error(`[refinePromptForOpenAiEdit] FAILED: ${e.message}`);
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

      return `
        Ultra high contrast black and white professional photographic representation. 
        High-end luxury editorial style, sharp focus, cinematic composition.
        ${lighting}, ${angle}, strong dramatic shadows, meticulous textures and high-fidelity details.
        ${bg}.
        ${professionalContext}

        STRICT VISUAL RULES:
        1. NO geometric shapes, NO lines, NO rectangles, NO squares, NO triangles.
        2. NO graphic design overlays, NO frames, NO borders, NO layout guides.
        3. PURE PHOTOGRAPHY: The image must look like a single, authentic professional photo.
        
        STRICT COLOR RULE: 
        The image is monochrome black and white. 
        ONE ACCENT COLOR ONLY: ${accent}, used subtly on a key element of the scene (like the ${options?.primaryObject || 'subject'}).
        
        CRITICAL: High-end campaign execution, luxury branding, ultra clean studio atmosphere.
        No watermark, no random text, no logo.
      `.trim();
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

  /**
   * Appelle l'API OpenAI Images Edit pour modifier une image
   * @param image Buffer de l'image d'entrée
   * @param prompt Prompt décrivant l'édition
   * @returns Buffer de l'image générée (en b64_json converti en Buffer)
   */
  /**
   * Appelle l'API OpenAI Images Edit pour modifier une image
   * @param image Buffer de l'image d'entrée
   * @param prompt Prompt décrivant l'édition
   * @returns Buffer de l'image générée
   */
  private async callOpenAiImageEdit(
    image: Buffer,
    prompt: string,
  ): Promise<Buffer> {
    this.logger.log(
      `[callOpenAiImageEdit] Starting Axios-based edit (gpt-image-1.5)`,
    );

    try {
      // 1. Force conversion to PNG with Sharp + Resize to 1024x1536 (GPT-1.5 requirement)
      // OpenAI requires an alpha channel for image edits.
      const pngBuffer = await sharp(image)
        .resize(1024, 1536, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .ensureAlpha()
        .png()
        .toBuffer();

      this.logger.log(
        `[callOpenAiImageEdit] Image optimized. Size: ${(pngBuffer.length / 1024 / 1024).toFixed(2)} MB`,
      );

      // Refine prompt to stay under 1000 chars
      const refinedPrompt = await this.refinePromptForOpenAiEdit(prompt);

      // 2. Prepare multipart form data using 'form-data' library (axios compatible)
      const formData = new NodeFormData();
      formData.append('model', 'gpt-image-1.5');
      formData.append('prompt', refinedPrompt);
      formData.append('image', pngBuffer, {
        filename: 'image.png',
        contentType: 'image/png',
      });
      formData.append('size', '1024x1536');
      formData.append('response_format', 'b64_json');

      const response = await axios.post(
        'https://api.openai.com/v1/images/edits',
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${this.openAiKey}`,
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        },
      );

      const b64 = response.data?.data?.[0]?.b64_json;
      if (!b64) {
        this.logger.error(
          `[callOpenAiImageEdit] Missing b64_json in response: ${JSON.stringify(response.data)}`,
        );
        throw new Error('No image data returned from OpenAI');
      }

      this.logger.log(`[callOpenAiImageEdit] SUCCESS.`);
      return Buffer.from(b64, 'base64');
    } catch (e: any) {
      const errorMsg = e.response?.data
        ? JSON.stringify(e.response.data)
        : e.message;
      this.logger.error(`[callOpenAiImageEdit] FAILED: ${errorMsg}`);
      throw e;
    }
  }

  /**
   * Call OpenAI /v1/images/generations with gpt-image-1.5
   */
  private async callOpenAiToolImage(prompt: string): Promise<Buffer> {
    this.logger.log(`[callOpenAiToolImage] Generating with gpt-image-1.5...`);
    const startTime = Date.now();

    // Inject "Grain of Reality" and realism constraints directly into the prompt
    const realismEnhancedPrompt = `
${prompt}

REALISM INSTRUCTIONS:
- Hyper-realistic photographic style.
- Natural skin texture with visible pores and subtle imperfections.
- Avoid plastic/smooth digital skin or overly perfect symmetry.
- Correct anatomical details: realistic fingers, hands, body proportions.
- Grain of Reality: Include tiny variations in lighting and shadows.
`.trim();

    try {
      const response = await axios.post(
        'https://api.openai.com/v1/images/generations',
        {
          model: 'gpt-image-1.5',
          prompt: realismEnhancedPrompt,
          n: 1,
          size: '1024x1024',
          background: 'opaque',
          quality: 'high',
          output_format: 'png',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.openAiKey}`,
          },
          timeout: 400000,
        },
      );

      this.logger.log(
        `[callOpenAiToolImage] RECEIVED RESPONSE after ${(
          (Date.now() - startTime) /
          1000
        ).toFixed(1)}s`,
      );

      const b64 = response.data?.data?.[0]?.b64_json;
      if (!b64) {
        this.logger.error(
          `[callOpenAiToolImage] No b64_json found: ${JSON.stringify(
            response.data,
          )}`,
        );
        throw new Error('No image result from OpenAI gpt-image-1.5');
      }

      const buffer = Buffer.from(b64, 'base64');
      this.logger.log(
        `[callOpenAiToolImage] SUCCESS - Received ${buffer.length} bytes`,
      );
      return buffer;
    } catch (error: any) {
      const errorMsg = error.response?.data
        ? JSON.stringify(error.response.data)
        : error.message;
      this.logger.error(`[callOpenAiToolImage] FAILED: ${errorMsg}`);
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
      const fileName = `gen_openai_${Date.now()}.png`;
      const filePath = path.join(
        __dirname,
        '../../../../uploads/ai-generations',
        fileName,
      );

      if (!fs.existsSync(path.dirname(filePath))) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
      }
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
      const fileName = `gen_final_${generationId}_${Date.now()}.png`;
      const uploadPath = path.join(process.cwd(), 'uploads', 'ai-generations');

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
    existingConversationId?: number,
  ) {
    const defaultStyle = 'Hero Studio';
    const styleName = style || params.style || defaultStyle;

    this.logger.log(
      `[generateImage] START - User: ${userId}, Seed: ${seed}, Style: ${styleName}, Job: ${params.job}, Query: ${params.userQuery}`,
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
        'masterpiece, ultra high quality, photorealistic, 8k resolution, highly detailed natural skin texture, sharp focus, soft natural lighting, professional photography, cinematic composition, realistic hair, clear eyes';

      // Build the final prompt by combining the base style guide with the refined query.
      const promptBody = refinedQuery
        ? `${refinedQuery}. Aesthetic: ${baseStylePrompt}.`
        : baseStylePrompt;

      // REALISM BOOST: Inject hyper-realistic photography triggers
      const realismTriggers = `
        photorealistic, 8k, highly detailed human skin texture, visible pores, 
        natural skin imperfections, subtle film grain, soft natural organic lighting, 
        candid photography style, sharp focus on eyes, 35mm lens, f/1.8. 
        NO plastic skin, NO artificial perfection.
      `.trim();

      const finalPrompt = `STYLE: ${styleName}. ${promptBody} QUALITY: ${realismTriggers} ${qualityTags}`;

      let finalNegativePrompt = this.NEGATIVE_PROMPT;

      // Additional specific filters for high-end styles
      if (
        styleName.toLowerCase().includes('premium') ||
        styleName.toLowerCase().includes('hero')
      ) {
        finalNegativePrompt = `
          ${finalNegativePrompt},
          glitch, noise, low contrast, oversaturated, distorted facial proportions, 
          mismatched eyes, weird gaze.
        `.trim();
      }

      if (styleName.toLowerCase().includes('monochrome')) {
        finalNegativePrompt = `
          ${finalNegativePrompt},
          geometric shapes, lines, rectangles, squares, triangles, abstract frames, 
          grids, artificial borders.
        `.trim();
      }

      if (file) {
        // OPENAI IMAGE EDIT (I2I)
        this.logger.log(
          `[generateImage] Strategy: OpenAI Image Edit (gpt-image-1.5)`,
        );
        finalBuffer = await this.callOpenAiImageEdit(file.buffer, finalPrompt);
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
          url: null,
          isAsync: true,
          status: 'PENDING',
        };
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
        conversationId: saved?.id.toString(),
        seed: seed || 0,
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
    existingConversationId?: number,
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
    existingConversationId?: number,
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
    // We strip 'style' from params to ensure the text generation is ONLY based on job and prompt.
    const { style: _, ...textParams } = params;
    const textRes = await this.generateText(
      { ...textParams, brandingInfo },
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
    const gen = await this.aiGenRepo.findOne({
      where: { id, user: { id: userId } },
    });

    if (!gen) return { success: false, message: 'Génération non trouvée' };

    try {
      // Delete associated files
      if (gen.imageUrl) this.deleteLocalFile(gen.imageUrl);
      if (gen.fileUrl) this.deleteLocalFile(gen.fileUrl);

      await this.aiGenRepo.remove(gen);
      this.logger.log(
        `[deleteGeneration] Deleted item ${id} for user ${userId}`,
      );
      return { success: true };
    } catch (error) {
      this.logger.error(`[deleteGeneration] Error: ${error.message}`);
      throw error;
    }
  }

  async clearHistory(userId: number) {
    try {
      const generations = await this.aiGenRepo.find({
        where: { user: { id: userId } },
      });

      // Delete all associated files
      for (const gen of generations) {
        if (gen.imageUrl) this.deleteLocalFile(gen.imageUrl);
        if (gen.fileUrl) this.deleteLocalFile(gen.fileUrl);
      }

      await this.aiGenRepo.remove(generations);
      this.logger.log(`[clearHistory] Cleared all items for user ${userId}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`[clearHistory] Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Helper to delete files that are stored locally on the server.
   */
  private deleteLocalFile(fileUrl: string) {
    if (!fileUrl) return;

    // Check if it's a relative path or a local domain URL
    let relativePath = '';
    if (fileUrl.startsWith('https://hipster-api.fr/uploads/')) {
      relativePath = fileUrl.replace('https://hipster-api.fr/uploads/', '');
    } else if (fileUrl.startsWith('/uploads/')) {
      relativePath = fileUrl.replace('/uploads/', '');
    } else if (!fileUrl.startsWith('http')) {
      relativePath = fileUrl;
    }

    if (relativePath) {
      const uploadPath = path.join(process.cwd(), 'uploads');
      const filePath = path.join(uploadPath, relativePath);

      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          this.logger.log(`[AiService] Deleted local file: ${filePath}`);
        }
      } catch (e) {
        this.logger.error(
          `[AiService] Failed to delete file ${filePath}: ${e.message}`,
        );
      }
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
    this.logger.log(
      `[chat] START - User: ${userId}, Messages: ${messages.length}, ConversationId: ${conversationId}, HasFile: ${!!file}`,
    );
    try {
      // 1. Load or initialize the conversation record
      let conversation: AiGeneration | null = null;
      if (conversationId) {
        conversation = await this.aiGenRepo.findOne({
          where: { id: parseInt(conversationId), user: { id: userId } },
        });
      }

      // Get the last user message to detect request type
      const lastUserMessage =
        messages
          .slice()
          .reverse()
          .find((m) => m.role === 'user')?.content || '';

      this.logger.log(`[chat] Last message: "${lastUserMessage}"`);

      // Detect if user is requesting an image (or if they provided a file)
      let requestType = await this.detectChatRequestType(lastUserMessage);
      if (file && requestType !== 'image') {
        this.logger.log('[chat] File provided, forcing requestType to image');
        requestType = 'image';
      }

      if (requestType === 'image') {
        this.logger.log('[chat] Image generation detected, generating...');
        // Generate image from user prompt
        const imageResult = await this.generateFreeImage(
          { prompt: lastUserMessage },
          userId,
          undefined,
          conversation?.id, // Use existing ID if available
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
          });
        } else if (imageResult.isAsync) {
          savedMessages.push({
            role: 'assistant',
            content: 'Image en cours de génération...',
          });
        }

        // Final update to ensure prompt history is complete in the record
        if (conversationIdToReturn) {
          await this.aiGenRepo.update(parseInt(conversationIdToReturn), {
            prompt: JSON.stringify(savedMessages),
          });
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
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages,
      });

      const content = response.choices[0]?.message?.content || '';

      // 3. Persist the updated conversation
      const finalMessages = [...messages, { role: 'assistant', content }];

      if (conversation) {
        conversation.prompt = JSON.stringify(finalMessages);
        conversation.result = content;
        await this.aiGenRepo.save(conversation);
      } else {
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
        });
        conversation = await this.aiGenRepo.save(conversation);
      }

      return {
        type: 'text',
        content: content,
        conversationId: conversation.id.toString(),
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
