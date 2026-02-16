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

  private async detectFace(image: Buffer): Promise<{
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  } | null> {
    try {
      const base64Image = image.toString('base64');
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: "Locate the main person's face in this photo. Return ONLY a JSON object with keys xmin, ymin, xmax, ymax representing the bounding box as percentages (0-100).",
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 50,
      });

      const content = response.choices[0].message.content;
      const match = content.match(/\{.*\}/s);
      if (match) {
        const box = JSON.parse(match[0]);
        this.logger.log(`[detectFace] Found face: ${JSON.stringify(box)}`);
        return box;
      }
    } catch (e) {
      this.logger.error(`[detectFace] Failed: ${e.message}`);
    }
    return null;
  }

  private async createFaceProtectionMask(
    width: number,
    height: number,
    box: { xmin: number; ymin: number; xmax: number; ymax: number },
    feather: boolean = true,
  ): Promise<Buffer> {
    const left = Math.round((box.xmin / 100) * width);
    const top = Math.round((box.ymin / 100) * height);
    const right = Math.round((box.xmax / 100) * width);
    const bottom = Math.round((box.ymax / 100) * height);

    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const rx = (right - left) / 1.8;
    const ry = (bottom - top) / 1.6;

    // Dark gray allows the AI to slightly modify expressions while keeping identity.
    const svg = `
      <svg width="${width}" height="${height}">
        <rect x="0" y="0" width="${width}" height="${height}" fill="white" />
        <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#222222" />
      </svg>
    `;

    let mask = sharp(Buffer.from(svg));
    if (feather) {
      mask = mask.blur(30); // High blur for smooth transition
    }
    return await mask.toFormat('png').toBuffer();
  }

  private async prepareComposedImage(
    originalImage: Buffer,
    box: { xmin: number; ymin: number; xmax: number; ymax: number },
  ): Promise<{ image: Buffer; mask: Buffer }> {
    const width = 1024;
    const height = 1024;

    // 1. Extract the face
    const originalMetadata = await sharp(originalImage).metadata();
    const faceLeft = Math.round((box.xmin / 100) * originalMetadata.width);
    const faceTop = Math.round((box.ymin / 100) * originalMetadata.height);
    const faceWidth = Math.round(
      ((box.xmax - box.xmin) / 100) * originalMetadata.width,
    );
    const faceHeight = Math.round(
      ((box.ymax - box.ymin) / 100) * originalMetadata.height,
    );

    const faceBuffer = await sharp(originalImage)
      .extract({
        left: faceLeft,
        top: faceTop,
        width: faceWidth,
        height: faceHeight,
      })
      .toBuffer();

    // 2. Position the face in a new 1024x1024 image
    const targetFaceHeight = Math.round(height * 0.18);
    const targetFaceWidth = Math.round(
      targetFaceHeight * (faceWidth / faceHeight),
    );
    const targetLeft = Math.round((width - targetFaceWidth) / 2);
    const targetTop = Math.round(height * 0.12); // Slightly lower for better proportions

    // Create a BLURRED version of the original image as lighting context
    // This helps the AI match colors and lighting perfectly.
    const lightingContext = await sharp(originalImage)
      .resize(width, height, { fit: 'cover' })
      .blur(40) // Very blurred just for color/light hints
      .toBuffer();

    const composedImage = await sharp(lightingContext)
      .composite([
        {
          input: await sharp(faceBuffer)
            .resize(targetFaceWidth, targetFaceHeight)
            .toBuffer(),
          top: targetTop,
          left: targetLeft,
        },
      ])
      .toFormat('png')
      .toBuffer();

    // 3. Create mask for the newly positioned face
    const faceBoxInComposed = {
      xmin: (targetLeft / width) * 100,
      ymin: (targetTop / height) * 100,
      xmax: ((targetLeft + targetFaceWidth) / width) * 100,
      ymax: ((targetTop + targetFaceHeight) / height) * 100,
    };

    const mask = await this.createFaceProtectionMask(
      width,
      height,
      faceBoxInComposed,
      true, // Feathered
    );

    return { image: composedImage, mask };
  }

  private async callInpaint(
    image: Buffer,
    prompt: string,
    mask: Buffer,
    negativePrompt?: string,
    seed?: number,
    stylePreset?: string,
  ): Promise<Buffer> {
    const formData = new FormData();
    formData.append('image', image, 'source.png');
    formData.append('mask', mask, 'mask.png');
    formData.append('prompt', prompt);
    if (negativePrompt) formData.append('negative_prompt', negativePrompt);
    if (seed) formData.append('seed', seed.toString());
    if (stylePreset) formData.append('style_preset', stylePreset);
    formData.append('output_format', 'png');

    return this.callStabilityApi('stable-image/edit/inpaint', formData);
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
            Transform the user's short request into a detailed, descriptive scene for an image-to-image generation.
            
            KEY RULE: If the user request implies a change in posture, position, or environment (e.g., "sitting on a chair", "standing", "holding a glass", "running", "looking at a mirror"), explicitly describe the new pose and setup vividly.
            
            OUTPUT FORMAT: Return ONLY a JSON object:
            {
              "prompt": "expanded English prompt",
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
      return `Professional representation of ${jobStr}.`;
    }

    return `Professional high-quality representation of ${jobStr}. Style: ${styleName}.`;
  }

  /* --------------------- STABILITY API TOOLS --------------------- */

  private async resizeImage(image: Buffer): Promise<Buffer> {
    return await sharp(image)
      .resize(1024, 1024, {
        fit: 'cover',
        withoutEnlargement: false,
      })
      .toFormat('png')
      .toBuffer();
  }

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
    const formData = new FormData();
    formData.append('init_image', image, 'init.png');
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

    let refinedQuery = userQuery;
    let isPostureChange = false;
    if (userQuery && file) {
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
        'shot on Canon EOS R5, f/1.8, 85mm lens, highly detailed, professional photography, natural skin texture, subtle film grain, sharp focus, 8k resolution';
      const finalPrompt = refinedQuery
        ? `${refinedQuery}. STYLE: ${baseStylePrompt}. QUALITY: ${qualityTags}`
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
        // Step 1: Normalize dimension to 1024x1024
        const normalizedImage = await this.resizeImage(file.buffer);

        // Step 2: Detect face on normalized image for coordinates
        const faceBox = await this.detectFace(normalizedImage);

        if (faceBox) {
          if (isPostureChange) {
            this.logger.log(
              `[generateImage] Posture change detected. Using SMART COMPOSITION.`,
            );
            const { image: composedImage, mask } =
              await this.prepareComposedImage(normalizedImage, faceBox);

            finalBuffer = await this.callInpaint(
              composedImage,
              finalPrompt,
              mask,
              finalNegativePrompt,
              seed,
              stylePreset,
            );
          } else {
            this.logger.log(
              `[generateImage] Standard portrait. Using INPAINT with face protection.`,
            );
            // Normalize for standard inpaint
            const mask = await this.createFaceProtectionMask(
              1024,
              1024,
              faceBox,
            );

            finalBuffer = await this.callInpaint(
              normalizedImage,
              finalPrompt,
              mask,
              finalNegativePrompt,
              seed,
              stylePreset,
            );
          }
        } else {
          this.logger.log(
            `[generateImage] No face detected. Falling back to V1 Image-to-Image`,
          );
          const prompts = [
            { text: finalPrompt, weight: 1.0 },
            {
              text: "highly detailed face, consistent facial features, sharp portrait, preservation of person's identity",
              weight: 0.65,
            },
          ];

          finalBuffer = await this.callV1ImageToImage(
            prompts,
            normalizedImage,
            0.38,
            seed,
            finalNegativePrompt,
            stylePreset,
          );
        }
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
