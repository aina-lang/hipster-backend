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
    
    private aiUserRepo: Repository<AiUser>,
    
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
    `extra fingers,mutated hands,six fingers,four fingers,extra limbs,detached limbs,missing limbs,fused fingers,deformed hands,cloned face,multiple heads,two heads,extra heads,distorted face,blurry,out of focus,low quality,pixelated,grain,lowres,text,watermark,logo,signature,letters,words,captions,labels,numbers,characters,symbols,typography,typesetting,advertisement text,cgi,3d,render,cartoon,anime,illustration,drawing,digital art,smooth plastic skin,artificial,airbrushed,unnatural skin,mustache,beard,facial hair,stubble,plastic,wax,doll,fake,unreal engine,octane render,oversaturated,high contrast,artificial lighting,porcelain,rubber,skin blemishes,distorted eyes,asymmetrical face,hyper-saturated,glowing edges,bad anatomy,bad proportions,amateur,draft,distorted facial features,plastic textures,oversmoothed skin,uncanny valley,oversaturated colors,multiple people,low resolution,photo-collage,heavy makeup,fake eyelashes,distorted gaze,airbrushed skin,digital over-sharpening,smooth plastic skin texture,perfectly symmetrical face,artificial CGI glow,wrong number of strings,wrong number of tuning pegs,mismatched strings and tuning pegs,extra tuning pegs,missing tuning pegs,extra strings,guitar with wrong string count,bass with wrong peg count,wrong number of frets,mismatched wheel count,extra wheels,missing wheels,wrong number of fingers,extra keyboard keys,wrong piano keys,mismatched parts,structurally incoherent object,physically impossible object,incorrect mechanical parts,synthetic banner,ai banner,digital banner,floating banner,fake signage,ai objects,synthetic texture,plastic objects,unrealistic furniture,cg banners`.trim();

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

  async refineQuery(
    query: string,
    job: string,
    styleName: string,
    language: string = 'French',
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
      // Escape special characters in variables to prevent JSON parsing errors
      const escapedJob = job.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const escapedStyle = styleName
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');

      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Image prompt engineer.Job="${escapedJob}" Style="${escapedStyle}".Return JSON only:{"prompt":"English scene description","isPostureChange":false,"accentColor":"deep red|burnt orange|electric purple|muted gold|royal blue|emerald green","lighting":"side dramatic|top cinematic|rim silhouette|split contrast|soft diffused","angle":"low|high|profile|three-quarter|front","background":"Location or environment (e.g. Poitiers street, Madagascar beach, minimalist forest, plain wall)","primaryObject":"iconic object for job"}IMPORTANT: If the user provided a specific prompt, keep ALL their descriptive details. ALL scenes MUST be strictly grounded in the "${escapedJob}" professional environment. Inclusion of people: Include them ONLY if the user specifically mentions a person, professional, or human action. Otherwise, focus on professional tools, equipment, and atmosphere of the ${escapedJob} world. DO NOT invent any text, names, or brands. ONLY include text or branding if specifically provided in the user prompt. If text is included, it MUST be in ${language}. PHYSICAL COHERENCE LAW: If the user specifies a count (e.g. "4-string bass", "6-string guitar", "4 wheels"), the generated scene MUST strictly match that count. The number of mechanically linked parts (strings=tuning pegs, wheels=axles, fingers=keys) MUST always be consistent and physically accurate. NEVER generate an instrument with a mismatched string/peg count. NEVER generate a vehicle with the wrong number of wheels.`,
          },
          { role: 'user', content: query || `Scene for ${job}` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 400,
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
              'You are a prompt engineer for OpenAI Image Edits. Your goal is to transform the PROVIDED IMAGE into a professional flyer. MANDATORY RULES: (1) Preserve the FACE and IDENTITY of the person in the image. (2) Preserve the CLOTHING and STYLE of the person unless explicitly asked to change them. (3) You MAY ADD context-relevant objects (e.g., if "bassiste" is mentioned, add a bass guitar being played) while strictly KEEPING the original outfit and appearance. (4) Use transformation instructions: "Keep the person facial features and clothing from the image, but add a [Object]...". (5) Typography must be ELEGANT and PREMIUM: use terms like "Modern Serif typography", "Swiss Minimalist layout", "Luxury fashion editorial fonts". AVOID "liquid metal". (6) ZERO HALLUCINATION: Never add data not in input. (7) Output ONE ONE-SHOT instruction in English (< 450 chars).',
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

  /**
   * 🎨 IMAGE EDIT WITH FULL PIPELINE (I2I)
   * Suit les mêmes 5 étapes que generateImage:
   * 1. refineSubject()       → Traduire job en sujet visuel
   * 2. refineQuery()         → Enrichir avec détails visuels
   * 3. getStyleDescription() → Appliquer style visuel
   * 4. Construire prompt final
   * 5. Appeler callOpenAiImageEdit avec prompt complet
   */
  private async callOpenAiImageEditWithFullPipeline(
    image: Buffer,
    params: any,
    style: string,
    userId?: number,
  ): Promise<Buffer> {
    this.logger.log(
      `[callOpenAiImageEditWithFullPipeline] START - Job: ${params.job}, Style: ${style}`,
    );

    const styleName = style;

    // ÉTAPE 1: refineSubject()
    let refinedSubject = '';
    if (params.job && params.job.length > 0) {
      refinedSubject = await this.refineSubject(params.job);
    }
    this.logger.log(
      `[callOpenAiImageEditWithFullPipeline] Étape 1 - refineSubject: "${refinedSubject}"`,
    );

    // ÉTAPE 2: refineQuery()
    const refinedRes = await this.refineQuery(
      params.userQuery || params.job,
      params.job,
      styleName,
      params.language || 'French',
    );
    const refinedQuery = refinedRes.prompt;
    this.logger.log(
      `[callOpenAiImageEditWithFullPipeline] Étape 2 - refineQuery: "${refinedQuery.substring(0, 100)}..."`,
    );

    // ÉTAPE 3: getStyleDescription()
    const baseStylePrompt = this.getStyleDescription(style, params.job, {
      accentColor: refinedRes.accentColor,
      lighting: refinedRes.lighting,
      angle: refinedRes.angle,
      background: refinedRes.background,
      primaryObject: refinedRes.primaryObject,
    });
    this.logger.log(
      `[callOpenAiImageEditWithFullPipeline] Étape 3 - Style: ${baseStylePrompt.substring(0, 100)}...`,
    );

    // Détection humains pour qualité tags
    const humanKeywords = [
      'homme',
      'femme',
      'personne',
      'visage',
      'mannequin',
      'worker',
      'ouvrier',
      'artisan',
      'man',
      'woman',
      'person',
      'human',
      'face',
      'eyes',
      'skin',
      'hair',
      'model',
      'portrait',
    ];
    const isHumanRequested = humanKeywords.some(
      (kw) =>
        refinedQuery.toLowerCase().includes(kw) ||
        (params.userQuery || '').toLowerCase().includes(kw) ||
        (params.job || '').toLowerCase().includes(kw),
    );

    // ÉTAPE 4: Construire prompt final (EXACTEMENT comme generateImage)
    const baseQuality =
      'masterpiece,high quality,photorealistic,8k,sharp focus,natural lighting,cinematic';
    const qualityTags = isHumanRequested
      ? `${baseQuality},detailed skin,realistic hair`
      : baseQuality;

    const genericRealism =
      'photorealistic,8k,hyper-detailed texture,film grain,natural lighting,cinematic composition,35mm,f/1.8.NO plastic,NO CGI';
    const humanRealism =
      'detailed skin,pores,imperfections,candid,sharp focus eyes';
    const realismTriggers = isHumanRequested
      ? `${genericRealism},${humanRealism}`
      : genericRealism;

    const promptBody = refinedQuery
      ? `${refinedQuery}. Aesthetic: ${baseStylePrompt}.`
      : baseStylePrompt;

    const noTextRulePipeline = (() => {
      const uq = (params.userQuery || '').toLowerCase();
      const textRequested = [
        'texte',
        'écris',
        'ecris',
        'ajoute le texte',
        'avec le texte',
        'slogan',
        'message',
        'write',
        'add text',
        'titre',
        'prix',
        'promo',
        'promotion',
        'offre',
        'réduction',
        'soldes',
        'citation',
        'hashtag',
      ].some((kw) => uq.includes(kw));
      return textRequested
        ? `Include ONLY the exact text explicitly requested: "${params.userQuery}". No other text or logo.`
        : 'NO text,NO watermark,NO logo,NO letters,NO numbers,NO words,NO captions,NO overlays';
    })();
    const finalPrompt = `STYLE: ${styleName}. ${promptBody}. Detailed requirements: ${params.userQuery || ''} QUALITY: ${realismTriggers} ${qualityTags}. RULES: ${noTextRulePipeline}`;

    let finalNegativePrompt = this.NEGATIVE_PROMPT;
    if (!isHumanRequested) {
      finalNegativePrompt = `${finalNegativePrompt},person,human,man,woman,mannequin,face,portrait,skin`;
    }
    if (
      styleName.toLowerCase().includes('premium') ||
      styleName.toLowerCase().includes('hero')
    ) {
      finalNegativePrompt = `${finalNegativePrompt},glitch,noise,low contrast,oversaturated,distorted face,mismatched eyes`;
    }

    this.logger.log(
      `[callOpenAiImageEditWithFullPipeline] Étape 4 - Final Prompt: ${finalPrompt.substring(0, 120)}...`,
    );
    this.logger.log(
      `[callOpenAiImageEditWithFullPipeline] Étape 4 - Negative Prompt (for reference, not used in /v1/images/edits): ${finalNegativePrompt.substring(0, 100)}...`,
    );

    // ÉTAPE 5: Appeler callOpenAiImageEdit avec le prompt complet
    // NOTE: negative_prompt is NOT passed because /v1/images/edits doesn't support it
    try {
      const editedImage = await this.callOpenAiImageEdit(image, finalPrompt);
      this.logger.log(
        `[callOpenAiImageEditWithFullPipeline] SUCCESS - Image edited`,
      );
      return editedImage;
    } catch (e) {
      this.logger.error(
        `[callOpenAiImageEditWithFullPipeline] FAILED - ${e.message}`,
      );
      throw e;
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

    // Premium Style: Realistic Photography with Sharp Backgrounds
    if (styleName === 'Premium') {
      const accent =
        options?.accentColor ||
        this.getRandomItem([
          'ruby red',
          'golden amber',
          'deep emerald',
          'royal blue',
        ]);
      const lighting =
        options?.lighting ||
        this.getRandomItem(['crisp natural sunlight', 'sharp side lighting']);
      const angle =
        options?.angle ||
        this.getRandomItem(['eye-level shot', 'natural three-quarter view']);
      const bg =
        options?.background ||
        this.getRandomItem([
          'clean modern architecture',
          'neutral sophisticated wall',
          'minimalist studio backdrop',
        ]);

      const bgDirectives = options?.background
        ? `Background: Crystal clear and distinctive representation of ${bg}. High visibility, sharp details. Add a subtle localized atmospheric haze (soft light veil) only in specific corners or edges for depth.`
        : `Background: Clean and elegant ${bg} with a hint of soft atmospheric lighting.`;

      let professionalContext = `The subject is in a real ${jobStr} environment.`;
      if (options?.primaryObject) {
        professionalContext = `The scene features a real ${options.primaryObject} in a natural ${jobStr} setting.`;
      }

      return `EXTREME CLARITY. Authentic photography. SHARP FOCUS on subject. Cleanest possible composition. ${lighting}, ${angle}, realistic skin textures. ${bgDirectives} ${professionalContext} RULES: SHARP AND DISTINCT. NO synthetic objects, NO ai-generated banners, NO floating graphics. PURE PHOTOGRAPHY. All objects must be real, physical, and tangible. Single natural subject. COLOR: Natural colors with a ${accent} accent. High-end candid style. ZERO ai-artifacts, ZERO fake signage, ZERO digital banners. Ensure everything looks like a real-world photograph.`
        .replace(/\s+/g, ' ')
        .trim();
    }

    if (styleName === 'Hero Studio') {
      return `Extreme minimalist portrait. Solid empty background, natural soft lighting. Focus ONLY on the person. NO objects, NO busy background. Clear and breathable.`;
    }
    if (styleName === 'Minimal Studio') {
      return `Minimalist to the maximum. Solid neutral background, huge negative space, soft daylight. The subject is the only focal point. Elegantly empty.`;
    }

    return `Minimalist professional photo of ${jobStr}. Extreme simplicity, spacious framing. Natural and empty.`;
  }

  private getModelDescription(
    modelName: string,
    job: string,
    options?: any,
  ): string {
    const model = modelName || 'Moderne minimaliste';
    const jobStr = job || 'professional';
    const accent = options?.accentColor || 'deep blue';
    const bg = options?.background || 'clean professional environment';
    const lighting = options?.lighting || 'natural professional lighting';

    let mood = 'Modern';
    let specificDirectives = '';
    let layout =
      'CENTERED COMPOSITION: Subject in the middle, clear space at the top/bottom for text.';
    let structure = 'CLEAN OVERLAYS: Subtle semi-transparent areas for text.';

    // Transform categories into prompt moods
    const modelLower = model.toLowerCase();

    // 1. STYLES MODERNES
    if (
      modelLower.includes('moderne') ||
      ['moderne flat design', 'moderne glassmorphism', 'moderne néon'].includes(
        modelLower,
      )
    ) {
      mood = 'Modern & Tech';
      layout =
        'RULE OF THIRDS: Subject strictly on the LEFT or RIGHT side, leaving 60% of the frame as clean negative space for typography.';
      structure =
        'GLASS PANELS: Floating semi-transparent "glassmorphism" panels for hosting titles and details.';
      if (modelLower.includes('glassmorphism'))
        specificDirectives =
          'Frosted glass effects, translucent layers with soft backlighting, and subtle colorful glows.';
      else if (modelLower.includes('néon')) {
        specificDirectives =
          'High contrast, dark background with vibrant neon tubes, glowing edges, and saturated electric colors.';
        layout =
          'CENTERED GLOW: Subject in center, radiating light towards the edges.';
        structure =
          'NEON BARS: Horizontal glowing neon lines/bars acting as separators for text.';
      } else if (modelLower.includes('géométrique')) {
        specificDirectives =
          'Sharp vector shapes (triangles, circles, diagonals) integrated into the composition.';
        structure =
          'GEOMETRIC SHAPES: Sharp, colorful abstract shapes behind the text areas.';
      } else if (modelLower.includes('fond sombre'))
        specificDirectives =
          'Deep obsidian or charcoal background with high-contrast text and sleek, rim lighting.';
      else if (modelLower.includes('flat design'))
        specificDirectives =
          'Solid colors, 2D minimalist aesthetics, and vector-style clarity.';
      else if (
        modelLower.includes('dégradé') ||
        modelLower.includes('gradient')
      ) {
        specificDirectives =
          'Vibrant abstract gradient background (Top-left: White/Cloud Blue; Top-right: Hot Pink/Magenta; Bottom: Deep Electric Purple/Navy). Subtle fine-grain paper texture for a premium feel.';
        layout =
          'LEFT BALANCE: Subject strictly on the LEFT, leaving 60% of the frame on the right and the bottom area for typography and negative space.';
        structure =
          'GRADIENT OVERLAYS: Smooth color-matched banners at the bottom and sides.';
      } else
        specificDirectives =
          'Clean lines, minimalist digital layout, and a contemporary tech vibe.';
    }
    // 2. STYLES COLORÉS / FUN
    else if (
      [
        'coloré vibrant',
        'pastel doux',
        'cartoon',
        'pop art',
        'fun enfants',
        'confettis',
        'festival couleurs',
        'abstrait artistique',
      ].includes(modelLower)
    ) {
      mood = 'Colorful & Playful';
      layout =
        'DYNAMIC CLUSTER: High-energy placement, objects/subject slightly tilted, organic and non-rigid composition.';
      structure =
        'PLAYFUL BLOBS: Organic, colorful rounded shapes (blobs) used as backgrounds for text.';
      if (modelLower.includes('pop art')) {
        specificDirectives =
          'Bold halftone patterns, high saturation, Ben-Day dots, and hard black outlines in Andy Warhol style.';
        layout =
          'QUADRANT SPLIT: Subject repeated or split into high-contrast color blocks.';
        structure =
          'COMIC SPEECH BUBBLES: Stylized speech bubbles for key text.';
      } else if (modelLower.includes('pastel'))
        specificDirectives =
          'Soft desaturated tones, mint, lavender, and soft peaches. Gentle, welcoming lighting.';
      else if (modelLower.includes('cartoon'))
        specificDirectives =
          '3D stylized illustration, exaggerated proportions, and a cheerful, saturated environment.';
      else if (modelLower.includes('abstrait'))
        specificDirectives =
          'Fluid paint splashes, geometric patterns, and experimental artistic textures.';
      else
        specificDirectives =
          'Explosion of vibrant colors, energetic patterns, and a joyful, high-spirited atmosphere.';
    }
    // 3. STYLES ÉLÉGANTS / LUXE
    else if (
      [
        'noir & or',
        'blanc & or',
        'élégant minimal',
        'luxe premium',
        'classique chic',
        'royal (violet/or)',
        'doré brillant',
        'soirée glamour',
      ].includes(modelLower)
    ) {
      mood = 'Elegant & Luxury';
      layout =
        'SYMMETRICAL PORTRAIT: Perfect central balance, wide margins for a premium "breathable" feel. High-fashion composition.';
      structure =
        'PREMIUM RIBBONS: Thin, elegant horizontal or vertical ribbons (gold or silk) for titles.';
      if (modelLower.includes('noir & or'))
        specificDirectives =
          'Matte black textures with polished 24k gold accents, gold foil elements, and premium dark lighting.';
      else if (modelLower.includes('blanc & or'))
        specificDirectives =
          'Pure white marble or silk textures with delicate gold linework and high-key soft lighting.';
      else if (modelLower.includes('royal'))
        specificDirectives =
          'Rich jewel tones like deep violet and emerald, with ornate gold flourishes and velvet textures.';
      else if (modelLower.includes('glamour'))
        specificDirectives =
          'Sparkling red carpet atmosphere with crystal reflections and elegant evening lighting.';
      else
        specificDirectives =
          'High-end editorial photoshoot, sophisticated rim lighting, and luxury material textures.';
    }
    // 4. STYLES FESTIFS / SOIRÉE
    else if (
      [
        'dj party',
        'clubbing',
        'neon night',
        'glow party',
        'urban street',
        'hip-hop',
        'afro vibe',
        'tropical party',
        'beach party',
        'sunset vibe',
      ].includes(modelLower)
    ) {
      mood = 'Festive & Nightlife';
      layout =
        'LOW ANGLE POWER: Subject viewed from a low angle to appear heroic/energetic. Text area in the upper 30% of the frame.';
      structure =
        'SLANTED TITLE BLOCKS: Aggressive, high-contrast diagonal banners for main headlines.';
      if (modelLower.includes('neon') || modelLower.includes('glow'))
        specificDirectives =
          'UV blacklight aesthetic, neon face paint, and intense glowing party accessories.';
      else if (
        modelLower.includes('tropical') ||
        modelLower.includes('beach') ||
        modelLower.includes('sunset')
      ) {
        specificDirectives =
          'Summer evening colors, silhouettes against a sunset, palm leaves, and relaxed beach-club vibes.';
      } else if (
        modelLower.includes('urban') ||
        modelLower.includes('hip-hop')
      ) {
        specificDirectives =
          'Street culture aesthetic, concrete textures, graffiti elements, and raw urban photography style.';
        layout =
          'WIDE URBAN SHOT: Subject integrated into a wide city/street background, rule of thirds.';
        structure = 'SPRAY PAINT BLOCKS: Rough textured blocks for event info.';
      } else
        specificDirectives =
          'Dynamic laser beams, smoke machine effects, pulsing club lights, and an energetic dancefloor atmosphere.';
    }
    // 5. STYLES PROFESSIONNELS
    else if (
      [
        'corporate clean',
        'conférence pro',
        'business formel',
        'tech digital',
        'startup moderne',
        'minimal corporate',
        'linkedin style',
        'webinaire professionnel',
      ].includes(modelLower)
    ) {
      mood = 'Professional & Corporate';
      layout =
        'BALANCED SPLIT: Subject on one side (left or right), clear structured block on the other side for professional details.';
      structure =
        'CLEAN SIDEBARS: Solid or semi-transparent vertical panels for structured information.';
      if (modelLower.includes('tech'))
        specificDirectives =
          'Circuit board patterns, holographic data visualizations, and blue-tinted modern technology lighting.';
      else if (modelLower.includes('startup'))
        specificDirectives =
          'Creative open-space office, collaborative vibes with whiteboards and modern minimalist furniture.';
      else if (modelLower.includes('linkedin')) {
        specificDirectives =
          'High-end studio portrait lighting, clean non-distracting background, and approachable professional look.';
        layout =
          'TIGHT HEADSHOT: Focused solely on shoulders and head, centered.';
      } else
        specificDirectives =
          'Sharp corporate layout, trustworthy blue and white tones, and crystal-clear business imagery.';
    }
    // 6. STYLES SPORTIFS
    else if (
      [
        'dynamique rouge/noir',
        'explosion énergie',
        'fitness impact',
        'sport compétition',
        'tournoi officiel',
        'street sport',
        'performance extrême',
      ].includes(modelLower)
    ) {
      mood = 'Sport & High Performance';
      layout =
        'DIAGONAL TENSION: Subject in motion crossing the frame diagonally. Creates a sense of speed and power.';
      structure =
        'DYNAMIC SPEED LINES: Slanted panels and aggressive sharp-edged banners.';
      if (modelLower.includes('explosion'))
        specificDirectives =
          'Epic dust and smoke explosions, flying gravel, and hyper-dynamic action trails.';
      else if (modelLower.includes('rouge/noir'))
        specificDirectives =
          'Aggressive high-contrast red and black palette with sharp speed lines and intense shadows.';
      else
        specificDirectives =
          'Dramatic lighting emphasizing muscle definition, sweat particles, and raw physical intensity.';
    }
    // 7. STYLES CLASSIQUES
    else if (
      [
        'classique traditionnel',
        'vintage',
        'rétro années 80',
        'rétro années 90',
        'old school',
        'papier texturé',
        'style affiche ancienne',
      ].includes(modelLower)
    ) {
      mood = 'Classic & Retro';
      layout =
        'FRAMED CENTER: Subject centered within a physical border or distinct "box" area. Classic poster structure.';
      structure =
        'ORNAMENTAL FRAMES: Classic physical borders and aged paper ribbon overlays.';
      if (modelLower.includes('80')) {
        specificDirectives =
          'Synthwave aesthetic, hot pink and cyan neon, chrome text effects, and retro-grid horizons.';
        layout =
          'HORIZON SPLIT: Subject in the upper half, grid/road in the lower half.';
        structure = 'CHROME BANDS: Reflective metallic bars for titles.';
      } else if (modelLower.includes('90'))
        specificDirectives =
          'Grainy film texture, vibrant primary colors, baggy street fashion vibes, and early digital elements.';
      else if (
        modelLower.includes('vintage') ||
        modelLower.includes('affiche ancienne')
      ) {
        specificDirectives =
          'Aged paper textures, ink-print imperfections, sepia tones, and classic turn-of-the-century typography.';
        structure = 'AGED BADGES: Retro-style stamped badges or banners.';
      } else
        specificDirectives =
          'Nostalgic film stock appearance, warm organic grain, and a timeless heritage atmosphere.';
    }
    // 8. STYLES NATURE
    else if (
      [
        'nature verte',
        'floral élégant',
        'tropical jungle',
        'éco / bio',
        'bohème',
        'minimal naturel',
        'rustique bois',
      ].includes(modelLower)
    ) {
      mood = 'Nature & Organic';
      layout =
        'ORGANIC INTEGRATION: Subject is not isolated, but blended into the environment (foliage, trees). Asymmetrical and natural.';
      structure =
        'BOTANICAL PANELS: Semi-transparent panels with subtle leaf or vine patterns.';
      if (modelLower.includes('floral'))
        specificDirectives =
          'Delicate botanical arrangements, soft petals, and high-key natural lighting.';
      else if (modelLower.includes('tropical'))
        specificDirectives =
          'Lush exotic greenery, monsteras, palm trees, and humid atmospheric depth.';
      else if (modelLower.includes('bois'))
        specificDirectives =
          'Warm raw wood grains, forest landscape, and rustic handcrafted textures.';
      else
        specificDirectives =
          'Sovereign greens, organic compositions, and a fresh eco-friendly professional vibe.';
    }
    // 9. STYLES VISUELS IMPACT
    else if (
      [
        'photo centrale dominante',
        'image plein écran',
        'poster cinéma',
        'affiche dramatique',
        'fond flou artistique',
        'double exposition',
        'collage moderne',
      ].includes(modelLower)
    ) {
      mood = 'Visual Impact';
      layout =
        'CINEMATIC POSTER: Wide shot, centered subject, dramatic lighting, large empty area at the bottom for major title.';
      structure =
        'CINEMATIC OVERLAYS: Letterbox-style dark bands or centered focal panels.';
      if (modelLower.includes('poster cinéma'))
        specificDirectives =
          'Epic wide-angle shot, teal and orange cinematic color grading, and dramatic backlighting.';
      else if (modelLower.includes('double exposition')) {
        specificDirectives =
          'Artistic double exposure: a silhouette layered with a secondary landscape or texture (e.g. city lights or forest).';
        layout =
          'SILHOUETTE CENTER: Centered clear silhouette acting as a container for the landscape.';
      } else if (modelLower.includes('flou'))
        specificDirectives =
          'Extreme bokeh, soft focus backgrounds to isolate the subject with surgical precision.';
      else
        specificDirectives =
          'One powerful central focal point, high visual contrast, and a "heroic" composition style.';
    }
    // 10. STYLES CRÉATIFS
    else if (
      [
        'asymétrique',
        'layout split (2 colonnes)',
        'typographie géante',
        'encadré central',
        'cercle dominant',
        'diagonal dynamique',
        'bloc moderne',
        'style magazine',
      ].includes(modelLower)
    ) {
      mood = 'Creative & Editorial';
      layout =
        'OVERLAP & DEPTH: Elements layering behind and in front of the subject. Breaking the grid.';
      structure =
        'EDITORIAL PANELS: Magazine-style solid blocks and overlapping title ribbons.';
      if (modelLower.includes('magazine')) {
        specificDirectives =
          'High-fashion magazine cover layout (e.g., Vogue, GQ style), large masthead, and editorial lighting.';
        layout =
          'EDITORIAL COVER: Subject full-height centered, text overlapping at the very top (masthead).';
      } else if (modelLower.includes('typographie')) {
        specificDirectives =
          'Giant, experimental typography that overlaps with the subject, creating a 3D depth effect.';
        layout =
          'TEXT DOMINANT: Giant letters occupying 50% of the frame, subject integrated into the letters.';
      } else if (modelLower.includes('split')) {
        layout =
          'VERTICAL SPLIT: Frame cut in half down the middle. One side for high-impact photo, one side for text backup.';
      } else
        specificDirectives =
          'Experimental grid-work, bold use of white space, and innovative graphic architecture.';
    }

    return `Mood: ${mood}. Layout Priority: ${layout}. Structural Elements: ${structure}. Specific Visuals: ${specificDirectives}. Job Context: ${jobStr}. ${lighting}. ${bg}. Accent Color: ${accent}. EXTREME CLARITY. Authentic photography style. SHARP FOCUS. RULES: All objects must be real, physical, and tangible. Professional graphic design overlays and banners are ENCOURAGED for text readability. High-end production value. Zero AI artifacts. Everything must look like a high-budget professional production for a "${model}" flyer.`
      .replace(/\s+/g, ' ')
      .trim();
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
    options?: { size?: string; quality?: string; skipRefinement?: boolean },
  ): Promise<Buffer> {
    try {
      this.logger.log(
        `[callOpenAiImageEdit] Starting streaming edit (gpt-image-1.5) - Size: ${options?.size || '1024x1536'}`,
      );

      const targetWidth = options?.size?.split('x')[0]
        ? parseInt(options.size.split('x')[0])
        : 1024;
      const targetHeight = options?.size?.split('x')[1]
        ? parseInt(options.size.split('x')[1])
        : 1536;

      // 1. Resize & convert to PNG
      const pngBuffer = await sharp(image)
        .resize(targetWidth, targetHeight, {
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

      // 2. Refine prompt ONLY if not explicitly skipped
      let finalPrompt = prompt;
      if (!options?.skipRefinement) {
        finalPrompt = await this.refinePromptForOpenAiEdit(prompt);
      } else {
        this.logger.log(
          `[callOpenAiImageEdit] Skipping prompt refinement — using prompt as-is`,
        );
      }

      // 4. Construire le POST body
      const postBody: any = {
        model: 'gpt-image-1.5',
        prompt: finalPrompt,
        images: [{ file_id: fileId }],
        size: options?.size || '1024x1536',
        quality: options?.quality || 'medium',
        output_format: 'jpeg', // Or 'png' if supported by model
        moderation: 'low',
        input_fidelity: 'high',
        n: 1,
        stream: true,
        partial_images: 0,
      };

      // NOTE: OpenAI /v1/images/edits does NOT support negative_prompt parameter
      // Only /v1/images/generations supports it
      // So we ignore negativePrompt here even if provided

      // 5. POST with stream: true — receive SSE events using input_file_id
      const response = await axios.post(
        'https://api.openai.com/v1/images/edits',
        postBody,
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
              this.logger.log(
                `[callOpenAiImageEdit] Received event: ${event.type}`,
              );

              if (event.type === 'error') {
                this.logger.error(
                  `[callOpenAiImageEdit] OpenAI Stream ERROR: ${JSON.stringify(event.error)}`,
                );
                reject(
                  new Error(
                    `OpenAI Stream Error: ${event.error?.message || 'Unknown error'}`,
                  ),
                );
                return;
              }

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
            } catch (e) {
              /* ignore sse fragments or malformed json */
            }
          }
        });
        response.data.on('error', (err) => reject(err));
        response.data.on('end', () =>
          reject(new Error('Stream ended without completion')),
        );
      });
    } catch (error: any) {
      if (error.response?.status === 400) {
        let detail = '';
        if (
          error.response.data &&
          typeof error.response.data.on === 'function'
        ) {
          // It's a stream, try to read it
          try {
            detail = await new Promise((resolve) => {
              let chunkStr = '';
              error.response.data.on('data', (chunk: any) => {
                chunkStr += chunk.toString();
              });
              error.response.data.on('end', () => resolve(chunkStr));
              // Safety timeout
              setTimeout(
                () => resolve(chunkStr || 'Timeout reading error stream'),
                3000,
              );
            });
          } catch (e) {
            detail = '[Failed to read error stream]';
          }
        } else {
          try {
            detail = JSON.stringify(error.response.data);
          } catch (e) {
            detail = '[Circular or Complex Data]';
          }
        }
        this.logger.error(`[callOpenAiImageEdit] 400 DETAIL: ${detail}`);
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
  private async callOpenAiToolImage(
    prompt: string,
    options?: { size?: string; quality?: string },
  ): Promise<Buffer> {
    try {
      this.logger.log(
        `[callOpenAiToolImage] Generating with gpt-image-1.5 (streaming)...`,
      );
      const startTime = Date.now();

      const realismEnhancedPrompt =
        `${prompt} REALISM:Hyper-realistic-photo,natural-skin-texture,visible-pores,correct-anatomy,natural-light. NO text,NO watermark,NO logo,NO letters,NO numbers,NO words,NO captions,NO overlays`
          .replace(/\s+/g, ' ')
          .trim();

      const response = await axios.post(
        'https://api.openai.com/v1/images/generations',
        {
          model: 'gpt-image-1.5',
          prompt: realismEnhancedPrompt,
          n: 1,
          size: options?.size || '1024x1024',
          background: 'opaque',
          quality: options?.quality || 'medium',
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
    this.logger.log(
      `[generateImage] START - User: ${userId}, Style: ${style}, hasFile: ${!!file}`,
    );
    try {
      const styleInfo = this.getStyleDescription(style, params.job);
      const styleName = style;
      const baseStylePrompt = styleInfo;

      this.logger.log(
        `[generateImage] Refined style prompt: ${baseStylePrompt.substring(0, 100)}...`,
      );

      const refinedRes = await this.refineQuery(
        params.userQuery || params.job,
        params.job,
        styleName,
        params.language || 'French',
      );
      const refinedQuery = refinedRes.prompt;

      this.logger.log(
        `[generateImage] Refined user query: ${refinedQuery.substring(0, 100)}...`,
      );
      let refinedSubject = '';
      if (params.job && params.job.length > 0) {
        refinedSubject = await this.refineSubject(params.job);
      }

      const userQuery = (params.userQuery || '').trim();

      // let refinedQuery = userQuery; // This line is now redundant due to the new refinedQuery above
      let isPostureChange = false;
      let styleOptions: any = {};

      // Enable GPT-powered prompt expansion for ALL modes (with or without image)
      // Now always refinement to get contextually aware style options (color, object, etc.)
      // const refinedData = await this.refineQuery( // This block is now redundant due to the new refinedRes above
      //   userQuery,
      //   refinedSubject,
      //   styleName,
      // );
      // refinedQuery = refinedData.prompt;
      isPostureChange = refinedRes.isPostureChange; // Use refinedRes
      styleOptions = {
        accentColor: refinedRes.accentColor,
        lighting: refinedRes.lighting,
        angle: refinedRes.angle,
        background: refinedRes.background,
        primaryObject: refinedRes.primaryObject,
      };

      // const baseStylePrompt = this.getStyleDescription( // This line is now redundant due to the new baseStylePrompt above
      //   styleName,
      //   refinedSubject,
      //   styleOptions,
      // );

      try {
        let finalBuffer: Buffer;

        const humanKeywords = [
          'homme',
          'femme',
          'personne',
          'visage',
          'mannequin',
          'worker',
          'ouvrier',
          'artisan',
          'man',
          'woman',
          'person',
          'human',
          'face',
          'eyes',
          'skin',
          'hair',
          'model',
          'portrait',
        ];
        const isHumanRequested = humanKeywords.some(
          (kw) =>
            refinedQuery.toLowerCase().includes(kw) ||
            (params.userQuery || '').toLowerCase().includes(kw) ||
            (params.job || '').toLowerCase().includes(kw),
        );

        const baseQuality =
          'masterpiece,high quality,photorealistic,8k,sharp focus,natural lighting,cinematic';
        const qualityTags = isHumanRequested
          ? `${baseQuality},detailed skin,realistic hair`
          : baseQuality;

        // REALISM BOOST: Inject hyper-realistic photography triggers
        const genericRealism =
          'photorealistic,8k,hyper-detailed texture,film grain,natural lighting,cinematic composition,35mm,f/1.8.NO plastic,NO CGI';
        const humanRealism =
          'detailed skin,pores,imperfections,candid,sharp focus eyes';
        const realismTriggers = isHumanRequested
          ? `${genericRealism},${humanRealism}`
          : genericRealism;

        // Build the final prompt by combining the base style guide with the refined query.
        const promptBody = refinedQuery
          ? `${refinedQuery}. Aesthetic: ${baseStylePrompt}.`
          : baseStylePrompt;

        // CRITICAL: Text on image is ONLY allowed if user explicitly requested it.
        const userQueryLower = (params.userQuery || '').toLowerCase();
        const userExplicitlyRequestsText = [
          'texte',
          'écris',
          'ecris',
          'ajoute le texte',
          'avec le texte',
          'inscription',
          'slogan',
          'message',
          'write',
          'add text',
          'sans-serif',
          'titre',
          'prix',
          'promo',
          'promotion',
          'offre',
          'réduction',
          'soldes',
          'citation',
          'hashtag',
        ].some((kw) => userQueryLower.includes(kw));

        const noTextRule = userExplicitlyRequestsText
          ? `IMPORTANT: Include ONLY the exact text explicitly requested by user: "${params.userQuery}". No other text, logo or watermark.`
          : 'NO text,NO watermark,NO logo,NO letters,NO numbers,NO words,NO captions,NO overlays,NO unsolicited branding';
        const finalPrompt = `STYLE: ${styleName}. ${promptBody}. Detailed requirements: ${params.userQuery || ''} QUALITY: ${realismTriggers} ${qualityTags}. RULES: ${noTextRule}`;

        let finalNegativePrompt = this.NEGATIVE_PROMPT;

        if (!isHumanRequested) {
          finalNegativePrompt = `${finalNegativePrompt},person,human,man,woman,mannequin,face,portrait,skin`;
        }

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
          // OPENAI IMAGE EDIT (I2I) WITH FULL PIPELINE
          this.logger.log(
            `[generateImage] Strategy: OpenAI Image Edit with FULL PIPELINE (gpt-image-1.5) - from uploaded file`,
          );
          finalBuffer = await this.callOpenAiImageEditWithFullPipeline(
            file.buffer,
            params,
            styleName,
            userId,
          );
        } else if (
          params.reference_image &&
          typeof params.reference_image === 'string' &&
          params.reference_image.startsWith('http')
        ) {
          // DOWNLOAD REMOTE IMAGE FOR EDIT WITH FULL PIPELINE
          this.logger.log(
            `[generateImage] Strategy: OpenAI Image Edit with FULL PIPELINE (gpt-image-1.5) - from remote URL: ${params.reference_image}`,
          );
          try {
            const downloadResp = await axios.get(params.reference_image, {
              responseType: 'arraybuffer',
            });
            const downloadedBuffer = Buffer.from(downloadResp.data);
            finalBuffer = await this.callOpenAiImageEditWithFullPipeline(
              downloadedBuffer,
              params,
              styleName,
              userId,
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
      `[generateText] START - Type: ${type}, User: ${userId}, Job: ${params.job}`,
    );
    try {
      const { userQuery, job, brandingInfo, imagePrompt } = params;
      this.logger.log(
        `[generateText] Params: query=${userQuery?.substring(0, 50)}, job=${job}`,
      );
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Professional ${type} writer. Language: ${params.language || 'French'}. Plain text, no markdown. Short & direct.
LOGIC:
1. The user's instructions (userQuery) are the main source of content.
2. You SHOULD improve, rephrase, and improvise the style to make it more impactful and professional. You don't need to be "verbatim", but you MUST NOT add new facts (prices, names, dates, specific offers).
3. Transform the provided info into a high-quality text. If the user input is minimal, improvise on the tone and impact using ONLY the context provided. NEVER invent factual claims (like phone numbers or specific prices) not given by the user.
4. NEVER describe image details (lighting, lens, background, composition) unless the user explicitly asks to describe the image.
5. NEVER add any information not present in userQuery or brandingInfo.
STYLE: Professional, impactful, punchy. Output ONLY the final text.`,
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
    this.logger.log(`[generateSocial] Calling generateImage...`);
    const imageRes = await this.generateImage(
      params,
      params.style || 'Hero Studio',
      userId,
      file,
      seed,
    );
    this.logger.log(
      `[generateSocial] generateImage returned. ID: ${imageRes?.id || imageRes?.generationId}`,
    );

    // 3. Generate Caption (Simple GPT)
    this.logger.log(`[generateSocial] Calling generateText for caption...`);
    const { style: _, ...textParams } = params;
    const textRes = await this.generateText(
      { ...textParams, brandingInfo, imagePrompt: imageRes.prompt },
      'social',
      userId,
    );
    this.logger.log(
      `[generateSocial] generateText returned. Length: ${textRes?.content?.length}`,
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

  async generateFlyer(
    params: any,
    userId: number,
    file?: Express.Multer.File,
    seed?: number,
  ) {
    const model = params.model || 'Anniversaire adulte';
    this.logger.log(
      `[generateFlyer] START - User: ${userId}, Model: ${model}, hasFile: ${!!file}`,
    );

    // Build a FLYER-specific prompt
    const userQueryLower = (params.userQuery || '').toLowerCase();

    // 1. Fetch user profile for branding
    const user = await this.getAiUserWithProfile(userId);

    // Detect branding intent
    const wantsBrandingColor = [
      'ma couleur',
      'mon branding',
      'branding color',
      'ma charte graphique',
    ].some((kw) => userQueryLower.includes(kw));

    const wantsBrandingInfo = [
      'mes infos',
      'mes informations',
      'mes coordonnées',
      'mon adresse',
      'mon tel',
      'mon numéro',
      'mon site',
      'ma boutique',
    ].some((kw) => userQueryLower.includes(kw));

    const avoidsBrandingColor = [
      'sans ma couleur',
      'pas ma couleur',
      'sans branding',
    ].some((kw) => userQueryLower.includes(kw));

    const avoidsBrandingInfo = [
      'sans mes infos',
      'sans mes informations',
      'sans mes coordonnées',
      'sans texte info',
    ].some((kw) => userQueryLower.includes(kw));

    const brandingColor =
      user?.brandingColor && wantsBrandingColor && !avoidsBrandingColor
        ? user.brandingColor
        : null;

    let brandingInfoStr = '';
    if (wantsBrandingInfo && !avoidsBrandingInfo && user) {
      const parts = [];
      if (user.name) parts.push(`Nom: ${user.name}`);
      if (user.professionalPhone) parts.push(`Tel: ${user.professionalPhone}`);
      if (user.professionalAddress)
        parts.push(`Adresse: ${user.professionalAddress}`);
      if (user.websiteUrl) parts.push(`Web: ${user.websiteUrl}`);
      brandingInfoStr = parts.join(' | ');
    }

    const userExplicitlyRequestsText = [
      'texte',
      'écris',
      'ecris',
      'ajoute le texte',
      'avec le texte',
      'inscription',
      'slogan',
      'message',
      'write',
      'add text',
      'titre',
      'prix',
      'promo',
      'promotion',
      'offre',
      'réduction',
      'soldes',
      'citation',
      'hashtag',
    ].some((kw) => userQueryLower.includes(kw));

    const hasUserQuery = (params.userQuery || '').trim().length > 0;
    const finalSize = '1024x1536';
    const orientation = 'portrait';

    const flyerLanguage = params.language || 'French';
    const flyerTextRule =
      userExplicitlyRequestsText || hasUserQuery || brandingInfoStr
        ? `ELITE GRAPHIC DESIGN RULES: 
           - Visual Framing: COMPOSITION: Wide or Middle shot. Ensure the person's head and shoulders are fully visible with safe margin above the head.
           - Style: "Premium Editorial" vibe. High-end, clean, professional structure.
           - Typographic Dynamism: USE DYNAMIC COMPOSITION. You ARE ENCOURAGED to use tilted text (angles), rotated titles, and asymmetric placements to make it look like a real professional poster.
           - SAFE AREA: Ensure all text and critical elements have a 15% margin from the edges.
           - Typography: ELEGANT & PREMIUM. Use professional designer fonts (Modern Serif, Swiss Minimalist, or Luxury Sans-serif).
           - Visual Hierarchy: Absolute clarity. Headline is high-impact, potentially rotated or angled for style.
           - CONTENT POLICY: Use the provided text: "${params.userQuery}"${brandingInfoStr ? ` AND professional info: "${brandingInfoStr}"` : ''} and creatively REPHRASE it into a catchy French slogan. 
           - LANGUAGE RULE: All text displayed on the image MUST be in ${flyerLanguage}.
           - COPYWRITING: Improvisation is REQUIRED for catchy impact. Make it sound like a real pro flyer.
           - ZERO HALLUCINATION: NO fake phone numbers, NO fake URLs.`
        : 'NO text on the image.';

    // 2. Refine the query for visual richness
    const refinedRes = await this.refineQuery(
      params.userQuery || params.job,
      params.job,
      model,
      flyerLanguage,
    );

    // 3. Get specific model description
    const baseStylePrompt = this.getModelDescription(model, params.job, {
      accentColor: brandingColor || refinedRes.accentColor,
      lighting: refinedRes.lighting,
      angle: refinedRes.angle,
      background: refinedRes.background,
    });

    const qualityTags =
      'sharp authentic photography,crystal clear subject,tangible real objects,high resolution,professional minimal design';

    // Ensure the subject from userQuery is the central object of the flyer
    const subjectDirectives = params.userQuery
      ? `VISUAL SUBJECT: Focus on "${params.userQuery}" with sharp clarity. Only include REAL physical objects. NO ai-generated banners, NO synthetic graphics, NO fake digital overlays. Background must remain visible and well-defined.`
      : '';

    // If we have a file, the prompt should be about TRANSFORMING, not GENERATING.
    const modePrefix = file
      ? `TRANSFORM THIS IMAGE into a sharp professional photo with the highest realism for a ${model}.`
      : `GENERATE a sharp professional photo with the highest realism from scratch for a ${model}.`;
    const finalPrompt = `${modePrefix} ${subjectDirectives} STYLE: ${baseStylePrompt}. CONTENT: ${refinedRes.prompt || params.userQuery || ''}. ${flyerTextRule}. DESIGN_STYLE: High-end photography, No artificial graphics. QUALITY: ${qualityTags}. NO AI BANNERS, NO floating objects. TECHNICAL NOTE: Ensure every element in the scene is a real-world object photographed naturally. Displayed text must be in ${flyerLanguage}.`;

    this.logger.log(
      `[generateFlyer] Final prompt: ${finalPrompt.substring(0, 150)}...`,
    );

    try {
      let finalBuffer: Buffer;

      if (file) {
        // Use the already-built flyer prompt directly (includes text rules)
        this.logger.log(
          `[generateFlyer] Strategy: Image Edit with FLYER prompt`,
        );
        finalBuffer = await this.callOpenAiImageEdit(file.buffer, finalPrompt, {
          size: finalSize,
          quality: 'high',
          skipRefinement: true,
        });
      } else {
        // Use HIGH quality and specified size for flyers
        finalBuffer = await this.callOpenAiToolImage(finalPrompt, {
          size: finalSize,
          quality: 'high',
        });
      }

      const fileName = `flyer_${Date.now()}.jpg`;
      const uploadPath = '/home/ubuntu/uploads/ai-generations';
      if (!fs.existsSync(uploadPath))
        fs.mkdirSync(uploadPath, { recursive: true });
      fs.writeFileSync(path.join(uploadPath, fileName), finalBuffer);

      const imageUrl = `https://hipster-api.fr/uploads/ai-generations/${fileName}`;
      const saved = await this.saveGeneration(
        userId,
        'FLYER',
        JSON.stringify([
          { role: 'user', content: finalPrompt },
          { role: 'assistant', content: 'Flyer généré' },
        ]),
        AiGenerationType.CHAT,
        { style: model, hasSourceImage: !!file },
        imageUrl,
      );

      this.logger.log(`[generateFlyer] SUCCESS - URL: ${imageUrl}`);
      return {
        url: imageUrl,
        generationId: saved?.id,
        isAsync: false,
        seed: seed || 0,
        prompt: finalPrompt,
      };
    } catch (error) {
      this.logger.error(`[generateFlyer] FAILED: ${error.message}`);
      throw error;
    }
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
