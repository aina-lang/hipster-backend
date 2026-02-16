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

  /* --------------------- INTENT DETECTION --------------------- */
  private async detectEditPrompts(
    query: string,
    job: string,
    styleName: string,
  ): Promise<{
    tool: 'REPLACE' | 'RECOLOR' | 'OUTPAINT' | 'STRUCTURE';
    search: string;
    prompt: string;
  }> {
    const lowerQuery = (query || '').toLowerCase();

    // Explicitly check if user wants a "surgical" edit (Replace or Recolor)
    const wantsReplace =
      lowerQuery.includes('replace') ||
      lowerQuery.includes('fond') ||
      lowerQuery.includes('background');
    const wantsRecolor =
      lowerQuery.includes('recolor') || lowerQuery.includes('couleur');
    const wantsOutpaint =
      lowerQuery.includes('expand') ||
      lowerQuery.includes('dezoom') ||
      lowerQuery.includes('élargir');

    if (!query || query.trim().length === 0) {
      return {
        tool: 'STRUCTURE',
        search: '',
        prompt: `A professional portrait. The person's face, head, and identity must remain absolutely unchanged. The style is ${styleName}. The person is a ${job}. Keep all facial features, expressions, and characteristics exactly as they are.`,
      };
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `
              You are an AI image editing assistant. 
              Tool selection rules:
              1. "tool": 
                 - "STRUCTURE": DEFAULT. Use for most requests, pose changes, clothing changes, and scene recreation.
                 - "RECOLOR": ONLY for strict color changes (e.g. "red shirt").
                 - "OUTPAINT": for "expand", "zoom out", "more space".
                 - "REPLACE": ONLY if user specifically asks to change the "background" (fond) or "replace" a specific part without touching anything else.
              2. "search": Only for REPLACE or RECOLOR.
              3. "prompt": A detailed visual description for the final result (in English).
              
              Respond STRICTLY in JSON: {"tool": "REPLACE" | "RECOLOR" | "OUTPAINT" | "STRUCTURE", "search": string, "prompt": string}
            `.trim(),
          },
          {
            role: 'user',
            content: `Job: ${job}, Style: ${styleName}, User Request: "${query}"`,
          },
        ],
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(response.choices[0]?.message?.content || '{}');
      const validTools = ['REPLACE', 'RECOLOR', 'OUTPAINT', 'STRUCTURE'];
      let tool = (
        validTools.includes(result.tool) ? result.tool : 'STRUCTURE'
      ) as any;

      if (wantsRecolor) tool = 'RECOLOR';
      if (wantsOutpaint) tool = 'OUTPAINT';
      if (wantsReplace) tool = 'REPLACE';

      return {
        tool,
        search: result.search || (tool === 'RECOLOR' ? 'clothes' : ''),
        prompt: result.prompt || query,
      };
    } catch (error) {
      return {
        tool: 'STRUCTURE',
        search: '',
        prompt: query,
      };
    }
  }

  /* --------------------- POSTURE DETECTION (DEPRECATED) --------------------- */
  private async detectPostureChange(query: string): Promise<boolean> {
    if (!query || query.trim().length === 0) return false;
    this.logger.log(`[detectPostureChange] Checking: "${query}"`);

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

    // Premium Style with randomized pools
    if (styleName === 'Premium') {
      const accentColors = [
        'deep red',
        'burnt orange',
        'electric purple',
        'muted gold',
        'emerald green',
        'sapphire blue',
        'rose gold',
        'crimson',
        'teal',
        'amber',
        'burgundy',
        'navy blue',
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
        Ultra high contrast black and white photography of ${subject}, editorial poster style, 
        ${lighting}, ${angle}, dramatic shadows, sharp facial details, subject centered, ${bg}.
        Graphic design elements: thin geometric lines, frame corners, layout guides, subtle grid overlay, modern poster composition.
        Color Instruction: The image is 99% black and white. Add a single, extremely subtle splash of ${accent} ONLY on one or two or more small geometric object .
        Selective color pop aesthetic. High fashion magazine, luxury campaign, premium branding, sharp focus, ultra clean.
        No watermark, no text, no letters, no typography, no words, no logo. Monochrome base with tiny colored accent.
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

    const response = await axios.post(
      `https://api.stability.ai/v2beta/${endpoint}`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${apiKey}`,
          Accept: 'image/*',
        },
        responseType: 'arraybuffer',
      },
    );
    return Buffer.from(response.data);
  }

  private async callStructure(
    image: Buffer,
    prompt: string,
    strength: number = 0.85,
    seed?: number,
    negativePrompt?: string,
    stylePreset?: string,
  ): Promise<Buffer> {
    const formData = new FormData();
    formData.append('image', image, 'source.png');
    formData.append('prompt', prompt);
    formData.append('control_strength', strength.toString());
    formData.append('output_format', 'png');

    if (seed) formData.append('seed', seed);
    if (negativePrompt) formData.append('negative_prompt', negativePrompt);
    if (stylePreset) formData.append('style_preset', stylePreset);

    return this.callStabilityApi('stable-image/control/structure', formData);
  }

  private async callStyle(
    image: Buffer,
    prompt: string,
    fidelity: number = 0.7,
  ): Promise<Buffer> {
    const formData = new FormData();
    formData.append('image', image, 'source.png');
    formData.append('prompt', prompt);
    formData.append('fidelity', fidelity.toString());
    formData.append('output_format', 'png');
    return this.callStabilityApi('stable-image/control/style', formData);
  }

  private async callReplaceBackground(
    image: Buffer,
    prompt: string,
  ): Promise<Buffer> {
    const formData = new FormData();
    formData.append('image', image, 'source.png');
    formData.append('background_prompt', prompt);
    formData.append('output_format', 'png');
    return this.callStabilityApi(
      'stable-image/edit/replace-background',
      formData,
    );
  }

  private async callRelight(image: Buffer, prompt: string): Promise<Buffer> {
    const formData = new FormData();
    formData.append('image', image, 'source.png');
    formData.append('select_label', 'subject'); // Lighting the subject to match background
    formData.append('prompt', prompt); // Light description
    formData.append('output_format', 'png');
    return this.callStabilityApi('stable-image/edit/relight', formData);
  }

  private async callSearchAndReplace(
    image: Buffer,
    prompt: string,
    searchPrompt: string,
    growMask?: number,
    seed?: number,
    stylePreset?: string,
  ): Promise<Buffer> {
    const formData = new FormData();
    formData.append('image', image, 'source.png');
    formData.append('prompt', prompt);
    formData.append('search_prompt', searchPrompt);
    formData.append('output_format', 'png');

    if (growMask !== undefined)
      formData.append('grow_mask', growMask.toString());
    if (seed) formData.append('seed', seed);
    if (stylePreset) formData.append('style_preset', stylePreset);

    return this.callStabilityApi(
      'stable-image/edit/search-and-replace',
      formData,
    );
  }

  private async callSearchAndRecolor(
    image: Buffer,
    prompt: string,
    selectPrompt: string,
    seed?: number,
  ): Promise<Buffer> {
    const formData = new FormData();
    formData.append('image', image, 'source.png');
    formData.append('prompt', prompt);
    formData.append('select_prompt', selectPrompt);
    formData.append('output_format', 'png');

    if (seed) formData.append('seed', seed);

    return this.callStabilityApi(
      'stable-image/edit/search-and-recolor',
      formData,
    );
  }

  private async callOutpaint(
    image: Buffer,
    prompt: string,
    left: number = 0,
    right: number = 0,
    top: number = 0,
    bottom: number = 0,
    seed?: number,
  ): Promise<Buffer> {
    const formData = new FormData();
    formData.append('image', image, 'source.png');
    if (prompt) formData.append('prompt', prompt);
    if (left > 0) formData.append('left', left.toString());
    if (right > 0) formData.append('right', right.toString());
    if (top > 0) formData.append('top', top.toString());
    if (bottom > 0) formData.append('bottom', bottom.toString());
    formData.append('output_format', 'png');

    if (seed) formData.append('seed', seed);

    return this.callStabilityApi('stable-image/edit/outpaint', formData);
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

    // For subject refinement, use job field if provided
    let refinedSubject = '';
    if (params.job && params.job.length > 0) {
      refinedSubject = await this.refineSubject(params.job);
    }

    const baseStylePrompt = this.getStyleDescription(styleName, refinedSubject);
    const userQuery = (params.userQuery || '').trim();

    // Style Preset handling
    const customStyles = ['Hero Studio', 'Premium', 'Minimal Studio'];
    let stylePreset = '';
    if (!customStyles.includes(styleName)) {
      stylePreset =
        styleName === 'None' || !styleName
          ? 'photographic'
          : styleName.toLowerCase().replace(/\s+/g, '-');
    }
    const orchestratorPrompt = (params.orchestratorPrompt || '').trim();

    try {
      let finalBuffer: Buffer;
      let finalDescription = '';

      if (file) {
        // --- DIRECT SEARCH AND REPLACE (MAX IDENTITY FIDELITY) ---
        const orchestratorPrompt = (params.orchestratorPrompt || '').trim();
        const intentSource = userQuery || orchestratorPrompt;

        this.logger.log(
          `[generateImage] Using Direct Edit Tool for maximum fidelity (Source: ${intentSource.substring(0, 30)}...)`,
        );

        const edit = await this.detectEditPrompts(
          intentSource,
          refinedSubject || params.job || '',
          styleName,
        );
        this.logger.log(
          `[generateImage] Tool: ${edit.tool}, Search: "${edit.search}", Prompt: "${edit.prompt}"`,
        );

        const isCustomStyle = customStyles.includes(styleName);
        
        // Add explicit instruction to preserve the person's face/head when modifying context
        const preserveFaceInstruction = 'IMPORTANT: Keep the person\'s face, head, facial features, and identity EXACTLY as they are in the reference image. Only change the context, clothes, background, and environment. The face must be completely untouched.';
        
        const finalPrompt = isCustomStyle
          ? `${baseStylePrompt}. Request: ${edit.prompt}. ${preserveFaceInstruction}. NEGATIVE: ${this.NEGATIVE_PROMPT}`
          : `${edit.prompt}, STYLE: ${baseStylePrompt}, 8k. ${preserveFaceInstruction}. NEGATIVE: ${this.NEGATIVE_PROMPT}`;

        finalDescription = `EDIT_${edit.tool} | Search: ${edit.search} | ${finalPrompt}`;
        // Create an anchor/stabilization pass to lock the face from the uploaded image.
        // This produces an intermediate reference (styled but with face preserved)
        // which we then use as the source for the main edit — this mimics the
        // behavior observed when regenerating from a previous generation.
        let sourceBuffer: Buffer = file.buffer;
        try {
          const anchorPrompt = isCustomStyle
            ? `${baseStylePrompt}. Preserve the person's face exactly as in the reference image. No identity changes.`
            : `Preserve the person's face exactly as in the reference image. ${baseStylePrompt}.`;

          this.logger.log('[generateImage] Creating anchor image to stabilize face');
          const anchorBuffer = await this.callStructure(
            file.buffer,
            anchorPrompt,
            0.995,
            seed,
            this.NEGATIVE_PROMPT,
            stylePreset,
          );
          if (anchorBuffer && anchorBuffer.length > 0) {
            sourceBuffer = anchorBuffer;
            this.logger.log('[generateImage] Anchor image created successfully');
          }
        } catch (e: any) {
          this.logger.error('[generateImage] Anchor creation failed: ' + (e?.message || e));
          sourceBuffer = file.buffer;
        }

        if (edit.tool === 'RECOLOR') {
          finalBuffer = await this.callSearchAndRecolor(
            sourceBuffer,
            finalPrompt,
            edit.search,
            seed,
          );
        } else if (edit.tool === 'OUTPAINT') {
          this.logger.log('[generateImage] Executing OUTPAINT expansion');
          finalBuffer = await this.callOutpaint(
            sourceBuffer,
            finalPrompt,
            128,
            128,
            0,
            0,
            seed,
          );
        } else if (edit.tool === 'STRUCTURE') {
          this.logger.log('[generateImage] Executing STRUCTURE scene recreation');
          const controlStrength = 0.99;
          finalBuffer = await this.callStructure(
            sourceBuffer,
            finalPrompt,
            controlStrength,
            seed,
            this.NEGATIVE_PROMPT,
            stylePreset,
          );
        } else {
          finalBuffer = await this.callSearchAndReplace(
            sourceBuffer,
            finalPrompt,
            edit.search,
            5,
            seed,
            stylePreset,
          );
        }
      } else {
        // --- STANDARD TEXT-TO-IMAGE (ULTRA) ---
        const visualDescription = userQuery
          ? `${userQuery}, STYLE: ${baseStylePrompt}, QUALITY: highly detailed professional photography, 8k resolution. NEGATIVE: ${this.NEGATIVE_PROMPT}`
          : `${baseStylePrompt}, QUALITY: highly detailed professional photography, 8k resolution. NEGATIVE: ${this.NEGATIVE_PROMPT}`;

        finalDescription = visualDescription;
        const formData = new FormData();
        formData.append('prompt', visualDescription);
        formData.append('output_format', 'png');
        if (stylePreset) formData.append('style_preset', stylePreset);
        if (seed) formData.append('seed', seed);

        finalBuffer = await this.callStabilityApi(
          'stable-image/generate/ultra',
          formData,
        );
      }

      // --- SAVE AND RETURN ---
      const fileName = `gen_${Date.now()}.png`;
      const uploadDir = path.resolve(
        process.cwd(),
        'uploads',
        'ai-generations',
      );
      if (!fs.existsSync(uploadDir))
        fs.mkdirSync(uploadDir, { recursive: true });

      const filePath = path.join(uploadDir, fileName);
      fs.writeFileSync(filePath, finalBuffer);

      const publicUrl = `https://hipster-api.fr/uploads/ai-generations/${fileName}`;
      this.logger.log(
        `[generateImage] SUCCESS - Saved to: ${filePath}, URL: ${publicUrl}`,
      );

      // Ensure seed is persisted with the generation attributes for reproducibility
      const attributesWithSeed = { ...(params || {}), seed: seed || 0 };
      const saved = await this.saveGeneration(
        userId,
        '',
        finalDescription,
        AiGenerationType.IMAGE,
        attributesWithSeed,
        publicUrl,
      );

      return {
        url: publicUrl,
        generationId: saved?.id,
        seed: seed || 0,
      };
    } catch (error: any) {
      this.logger.error(
        `[generateImage] FAILED - ${error.response?.data?.toString() || error.message}`,
      );
      if (error.response?.data) {
        try {
          const errData = Buffer.isBuffer(error.response.data)
            ? error.response.data.toString()
            : JSON.stringify(error.response.data);
          this.logger.error(
            `[generateImage] Stability API Response: ${errData}`,
          );
        } catch (e) {}
      }
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

  /* --------------------- SOCIAL POSTS (ORCHESTRATED) --------------------- */
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

    let brandingContext = '';
    let effectiveJob = params.job; // Use provided job

    if (userId) {
      const u = await this.getAiUserWithProfile(userId);
      if (u) {
        // Build comprehensive branding context with contact info
        const contactInfo = [];
        if (u.professionalPhone)
          contactInfo.push(`Tel: ${u.professionalPhone}`);
        if (u.email) contactInfo.push(`Email: ${u.email}`);
        if (u.professionalAddress)
          contactInfo.push(`Adresse: ${u.professionalAddress}`);

        brandingContext = `Nom: ${u.name}, Job: ${u.job}`;
        if (contactInfo.length > 0) {
          brandingContext += `, ${contactInfo.join(', ')}`;
        }

        // If no job provided in params, use user's profile job
        if (!effectiveJob) {
          effectiveJob = u.job;
        }
      }
    }

    // userQuery is independent - it can be empty or filled
    // effectiveJob is the job to use for content generation
    const orchestration = await this.orchestrateSocial(
      params.userQuery || '', // userQuery can be empty
      effectiveJob || '', // job from params or user profile
      brandingContext,
      `Function: ${params.function || 'General'}`,
    );

    let imageRes: any = { url: '' };
    // Bias towards generating image if file provided or if orchestration says so
    if (orchestration.generateImage || !!file) {
      imageRes = await this.generateImage(
        {
          ...params,
          // CRITICAL: We pass the orchestrator's prompt BUT ALSO Keep the original query for intent detection
          orchestratorPrompt: orchestration.imagePrompt,
        },
        params.style || 'Hero Studio',
        userId,
        file,
        seed,
      );
    }

    // Use the orchestrator's captionText directly instead of regenerating it
    const textContent = orchestration.captionText || '';

    const result = {
      image: imageRes.url || '',
      text: textContent,
      orchestration,
      generationId: imageRes.generationId,
    };

    this.logger.log(
      `[generateSocial] SUCCESS - Image: ${result.image || 'NONE'}, Text: ${result.text.substring(0, 30)}...`,
    );
    return result;
  }

  private async orchestrateSocial(
    query: string,
    job: string,
    branding: string,
    context: string,
  ) {
    try {
      this.logger.log(
        `[orchestrateSocial] Decision - Job: "${job}", Query: "${query}"`,
      );
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `
              You are a social media orchestrator. 
              Decide if an image and/or text caption is needed for the given query.
              Most social posts BENEFIT from an image. 
              
              CRITICAL RULES:
              1. The MAIN SUBJECT must be about the Job/Profession provided.
              2. The imagePrompt should focus on the Job/Profession (e.g., plumber, chef, etc.).
              3. The captionText should be about the Job/Profession BUT MUST INCLUDE the user's name/branding for contact/credibility.
              4. CONTACT INFO: If the branding includes contact information (Tel, Email, Adresse), include them in the caption text for easy contact.
              5. If a specific User Query is provided, incorporate it into the content about the Job/Profession.
              6. FORMATTING: Never use markdown formatting (no **, __, ##, etc.) in captionText. Use plain text only. DO include relevant hashtags at the end for social media.
              
              Example: If Job is "Plombier" and Branding is "Nom: Aina Mercia, Job: Coiffure, Tel: 0123456789, Email: contact@example.com":
              - imagePrompt: "A professional plumber fixing pipes, tools and equipment"
              - captionText: "Vous cherchez un plombier qualifié ? Contactez Aina Mercia au 0123456789 ou par email à contact@example.com pour des services de plomberie professionnels ! #Plombier #Services #Professionnel"
              
              Respond STRICTLY in JSON with:
              {
                "generateImage": boolean,
                "generateText": boolean,
                "imagePrompt": "visual description for image generation (in English)",
                "captionText": "social media post text (in French), plain text with hashtags"
              }
            `.trim(),
          },
          {
            role: 'user',
            content: `PRIMARY SUBJECT - Job/Profession: "${job}"
Additional Context - User Query: "${query}"
Branding Info (for tone only): ${branding}
Function: ${context}`,
          },
        ],
        response_format: { type: 'json_object' },
      });
      const decision = JSON.parse(response.choices[0].message.content);
      this.logger.log(
        `[orchestrateSocial] Decision: ${JSON.stringify(decision)}`,
      );
      return decision;
    } catch (error) {
      this.logger.error(`[orchestrateSocial] Error: ${error.message}`);
      return {
        generateImage: true,
        generateText: true,
        imagePrompt: job || query,
        captionText: job || query,
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
        const resp = await axios.get(gen.imageUrl, { responseType: 'arraybuffer' });
        file = { buffer: Buffer.from(resp.data) } as any;
      } catch (e) {
        this.logger.error(`[regenerateFromGeneration] Failed to download image: ${e.message}`);
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
