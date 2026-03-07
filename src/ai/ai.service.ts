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
import { VISUAL_ARCHITECTURES } from './config/visual-architectures';
import {
  getVisualArchitecture,
  VisualArchitecture,
} from './config/visual-architectures-78';
import { FlyerCategory, VariantStructure } from './types/flyer.types';
import { FLYER_CATEGORIES } from './constants/flyer-categories';

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
    brandingColor?: string,
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

      const brandingInstruction = brandingColor
        ? `IMPORTANT: The user brand color is "${brandingColor}". Use this as the primary accent color for the scene and its atmospheric lighting.`
        : '';

      const resp = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Image prompt engineer.Job="${escapedJob}" Style="${escapedStyle}". ${brandingInstruction} Return JSON only:{"prompt":"English scene description","isPostureChange":false,"accentColor":"${brandingColor || 'color name'}","lighting":"side dramatic|top cinematic|rim silhouette|split contrast|soft diffused","angle":"low|high|profile|three-quarter|front","background":"Location or environment","primaryObject":"iconic object for job"}`,
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
        accentColor: data.accentColor || brandingColor,
        lighting: data.lighting,
        angle: data.angle,
        background: data.background,
        primaryObject: data.primaryObject,
      };
    } catch (e) {
      this.logger.error(`[refineQuery] ${e.message}`);
      return {
        prompt: query,
        isPostureChange: false,
        accentColor: brandingColor,
      };
    }
  }

  private getRandomItem(pool: string[]): string {
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * 🎨 BUILD FASHION VERTICAL PREMIUM PROMPT FOR DALL-E
   * Generates ultra-refined DALL-E prompt for TYPE_FASHION_VERTICAL posters
   * Supports text parameters: mainWord, scriptPhrase, infoLine, accentColor
   * Reference: Vogue, Numéro Magazine, Harper's Bazaar editorial quality
   */
  private buildFashionVerticalPrompt(
    architecture: any,
    job: string,
    userQuery: string,
    mainWord: string,
    scriptPhrase: string,
    infoLine: string,
    colorPrincipale: string = '#17A2B8',
    colorSecondaire: string = '#FFFFFF',
    customSubject: string = '',
    isPersonRequested: boolean = false,
  ): string {
    const magazineReference = `MAGAZINE EDITORIAL REFERENCE: Editorial-quality fashion photography from Vogue, Numéro, or Harper's Bazaar. High-fashion magazine cover and inner spread standards. Professional magazine photography, NOT advertorial.`;

    // 🔒 ABSOLUTE LOCKED POSE OR CUSTOM SUBJECT
    const subjectCinematography =
      customSubject && !isPersonRequested
        ? `SUBJECT: ${customSubject}. Ensure editorial quality and professional lighting.`
        : `CINEMATOGRAPHY – SUBJECT (ABSOLUTE POSE LOCK – DO NOT MODIFY):
- The subject’s ORIGINAL POSE, ORIGINAL ORIENTATION, and ORIGINAL HEAD + BODY DIRECTION must be REPRODUCED EXACTLY AS IN THE REFERENCE.
- This includes:
  • Exact body rotation (left, right, front, back),
  • Exact head turn and chin angle,
  • Exact gaze direction (eyes looking left/right/up/down),
  • Exact inclination and tilt of neck, torso, and head,
  • Exact shoulder angle and arm position,
  • Exact posture, stance, and weight distribution.
- The silhouette must remain IDENTICAL to the reference: same limb flow, same contour, same line-of-action.
- STRICTLY FORBIDDEN:
  • Pose correction or beautification,
  • Camera re-framing, new angles, tilt, rotation,
  • Mirroring, flipping, or straightening the subject,
  • Any reinterpretation of orientation or inclination.
- Whatever direction the subject faces or looks in the reference (left, right, up, down), DALL·E MUST REPRODUCE IT EXACTLY without ANY variation.`;

    // BACKGROUND
    const backgroundTreatment = `BACKGROUND TREATMENT:
- ATMOSPHERE: MOODY_GRADIENT, intensity: MEDIUM_DARK.
- BORDER AESTHETIC: NOIR SOMBRE AUTOUR (DEEP BLACK VIGNETTE). The extreme edges, corners, and perimeter of the image MUST be a solid, deep, moody black.
- PLACEMENT: FULL_FRAME.
- GRADIENT DIRECTION: TOP_RIGHT_TO_BOTTOM_LEFT.
- COLOR DOMINANCE: Ensure the Primary Color (${colorPrincipale}) is dominant on the LEFT side of the frame.
- TRANSITION: Sophisticated OPAQUE and SOLID background transitioning from deep black edges to ${colorPrincipale} to ${colorSecondaire}.
- PROHIBITIONS: STRICTLY FORBID: ["motion_blur", "speed_trails", "busy_patterns"].
- Depth: Sharp textures on solid surfaces. The white is crisp and OPAQUE. NO fog, NO smoke.`;

    // TEXT
    const textContextGuide = `TYPOGRAPHY & TEXT RENDERING (MANDATORY):
- YOU MUST RENDER THE FOLLOWING TEXT DIRECTLY ON THE IMAGE:
  1. MAIN TITLE: "${mainWord.toUpperCase()}"
     - POSITION: Vertically along FAR LEFT margin.
     - READING: TOP-TO-BOTTOM (first letter at the top). Rotate 90° clockwise.
     - ABSOLUTE PREMIER PLAN (FOREGROUND): The text MUST overlay and overlap the subject. It must be in the absolute foreground, never partially obscured.
     - STYLE: ULTRA-BOLD and MASSIVE SCALE high-impact font (like "Anton", "Bebas Neue", or "Impact"), filling 85-95% of total height.
     - COLOR: ${colorPrincipale}, solid, opaque.
     - ALIGNMENT: Perfectly vertical (NO tilt).
  2. SCRIPT SUBTITLE: "${scriptPhrase}"
     - POSITION: CENTER-BOTTOM.
     - STYLE: Elegant cursive.
     - TILT: +20° to +25° upward right.
     - COLOR: ${colorSecondaire}.
  3. INFO BAR: "${infoLine}"
     - POSITION: ABSOLUTE BOTTOM.
     - STYLE: Small caps, wide tracking.
     - COLOR: White or light grey.
- BIG BOLD TYPOGRAPHY MANDATE: The Main Title must be HEAVY, THICK, and VISUALLY DOMINANT. 
- NO frames, NO boxes, NO transparency, NO backgrounds behind text. Characters must be 100% OPAQUE.`;

    // TECH SPECS
    const technicalQuality = `TECHNICAL SPECIFICATIONS – VOGUE/NUMÉRO STANDARD:
- Resolution: Minimum 4K, conceptual 8K quality.
- Style: Hyperrealistic fashion editorial photography.
- Post-Processing: Subtle vignetting, saturated luxury color grading.
- Composition: Rule-of-thirds, dramatic lighting ratios.
- COLOR MANDATE: Full vivid color only (NO black and white).`;

    // PROHIBITIONS
    const prohibitions =
      customSubject && !isPersonRequested
        ? `PROHIBITIONS – CRITICAL:
- NO humans, NO people, NO fashion models, NO mannequins. Focus ONLY on the object/subject.
- NO anatomy distortions or AI artifacts.
- NO watermarks, NO signatures, NO metadata.
- NO grayscale, NO desaturation.
- NO stock-photo style. UNIQUE editorial aesthetic only.`
        : `PROHIBITIONS – CRITICAL:
- NO pose change. NO orientation change. NO inclination change.
- NO anatomy distortions or AI artifacts.
- NO watermarks, NO signatures, NO metadata.
- NO grayscale, NO desaturation.
- NO stock-photo style. UNIQUE editorial aesthetic only.`;

    // FINAL PROMPT
    const finalPrompt = `${magazineReference}

${subjectCinematography}

${backgroundTreatment}

${textContextGuide}

${technicalQuality}

${prohibitions}

EXECUTION MANDATE:
${
  customSubject
    ? `Produce a high-end magazine cover featuring the specified subject perfectly integrated into the editorial aesthetic. Text must be rendered exactly as specified.`
    : `Produce a high-end magazine cover with the subject’s pose, orientation, and inclination reproduced EXACTLY as in the reference. ABSOLUTELY NO CHANGES to body position, gaze direction, silhouette, or camera angle. Text must be rendered exactly as specified.`
}`;

    this.logger.log(
      '[buildFashionVerticalPrompt] Generated fashion vertical prompt for DALL-E with ABSOLUTE pose lock',
    );

    return finalPrompt;
  }

  private buildEditorialCoverPrompt(
    architecture: any,
    job: string,
    userQuery: string,
    mainWord: string,
    scriptPhrase: string,
    infoLine: string,
    colorPrincipale: string = '#17A2B8',
    colorSecondaire: string = '#FFFFFF',
    customSubject: string = '',
    isPersonRequested: boolean = false,
  ): string {
    const magazineReference = `
MAGAZINE EDITORIAL REFERENCE:
Luxury high-fashion editorial cover inspired by Vogue, Numéro, Harper's Bazaar.
Minimalist premium magazine cover.
Studio photography only.
NOT advertisement. NOT street poster. PURE editorial aesthetic.
`;

    // 🔒 SUBJECT — STRICT SINGLE CENTERED COMPOSITION
    const subjectRules =
      customSubject && !isPersonRequested
        ? `
SUBJECT RULES (STRICT – NO EXCEPTION):
- ONLY ONE MAIN SUBJECT: "${customSubject}".
- Interpret additional user intent from: "${userQuery}".
- Single isolated subject only. Subject perfectly CENTERED.`
        : `
SUBJECT RULES (STRICT – NO EXCEPTION):
- ONLY ONE MAIN SUBJECT related to: "${job}".
- Interpret user intent from: "${userQuery}".
- Single isolated subject only.
- Subject perfectly CENTERED.
- No secondary characters.
- No environment context.
- Ultra realistic studio photography.
- Clean silhouette.
- Professional balanced lighting.

WARDROBE & ACCESSORIES – COLOR ONLY CHANGE (STYLE PRESERVED):
- PRESERVE the original outfit EXACTLY: same cut, same style, same silhouette, same accessories.
- DO NOT change any piece of clothing or accessory — only RECOLOR them.
- ALL clothing items (jacket, shirt, pants, dress, coat, etc.) must be rendered in shades of ${colorPrincipale} ONLY.
- ALL accessories (hat, cap, glasses, sunglasses, scarf, jewelry, bag, etc.) must be rendered in shades of ${colorPrincipale} ONLY.
- STRICTLY NO contrasting colors anywhere on the outfit.
- Subtle lightness/saturation variation of ${colorPrincipale} is allowed for natural fabric depth.
- The overall look must be a cohesive, monochromatic outfit from head to toe.
`;

    // 🎨 BACKGROUND — MONOCHROMATIC SOLID
    const backgroundRules = `
BACKGROUND TREATMENT:
- Solid or ultra-soft gradient using ONLY shades of ${colorPrincipale}.
- Single dominant color: ${colorPrincipale}.
- Use variations in brightness/saturation for subtle depth, but NO secondary accent colors.
- Clean minimal aesthetic.
- No textures.
- No patterns.
- No vignette.
- No graphic overlays.
- No depth effects.
- Flat premium editorial background.
`;

    // ✍️ TYPOGRAPHY — FINE LUXURY SERIF
    const typographyRules = `
TYPOGRAPHY & TEXT RENDERING (MANDATORY):

You MUST render the following text exactly. Text must be elegant, legible, and premium.

1. TOP TITLE:
"${mainWord.toUpperCase()}"
- Position: STRICTLY flush to the LEFT edge of the image. Absolutely no centering.
- Font: Fine luxury serif (Didot, Bodoni, or Playfair Display). Semi-bold weight — NOT ultra heavy.
- Size: Approximately 12-15% of image height per line. Slightly smaller than before to stay elegant.
- WORD WRAPPING: If the title contains multiple words, place EACH WORD on its own line, stacked top-to-bottom. Scale down font size slightly per line to ensure all words fit without overflow.
- Color: Bright light tint of ${colorPrincipale} — significantly lighter/more luminous than the background, same hue family. NOT pure white.
- Uppercase. Refined letter spacing. No italic. No rotation. No centering.

2. MAIN HEADLINE:
"${scriptPhrase}"
- Position: Bottom 30% of image, center-aligned.
- Font: Elegant serif (Didot, Times New Roman, or Garamond). Regular to semi-bold weight.
- Size: Prominent and readable. NOT oversized.
- Color: Bright light tint of ${colorPrincipale} — clearly visible against the monochromatic background.
- Horizontal alignment only. No italic.

3. SUBLINE:
"${infoLine}"
- Position: Directly under main headline.
- Font: Light serif, smaller than headline. Airy and refined.
- Color: Light tint of ${colorPrincipale}, 100% opaque.
- Horizontal only.

STRICT TEXT RULES:
- Maximum 4 text blocks.
- NO vertical text. NO rotated text. NO italic. NO script. NO box behind text.
- All text 100% opaque and fully legible.
- Text color must be a clearly lighter/brighter value of ${colorPrincipale} — enough contrast to read instantly.
- TEXT MUST STAND OUT against the background while staying in the same color family.
`;

    // 📷 TECHNICAL QUALITY
    const technicalQuality = `
TECHNICAL SPECIFICATIONS – HIGH FASHION COVER STANDARD:
- 4K resolution minimum.
- Hyperrealistic studio photography.
- Balanced editorial lighting.
- Premium color grading.
- Sharp focus.
- Clean skin tones.
- Full color only (NO black & white).
- No dramatic cinematic shadows.
- No heavy retouch look.
`;

    // 🚫 PROHIBITIONS
    const prohibitions =
      customSubject && !isPersonRequested
        ? `
PROHIBITIONS – CRITICAL:
- NO humans, NO people, NO fashion models, NO mannequins. Focus ONLY on the object/subject.
- NO second subject.
- NO background objects.
- NO extra graphics.
- NO decorative overlays.
- NO magazine badges.
- NO price stickers.
- NO borders.
- NO watermarks.
- NO logos except fixed footer.
- NO vertical typography.
- NO italic text.
- NO artistic reinterpretation.
- NO busy layout.
`
        : `
PROHIBITIONS – CRITICAL:
- NO second subject.
- NO background objects.
- NO extra graphics.
- NO decorative overlays.
- NO magazine badges.
- NO price stickers.
- NO borders.
- NO watermarks.
- NO logos except fixed footer.
- NO vertical typography.
- NO italic text.
- NO artistic reinterpretation.
- NO busy layout.
`;

    const monochromaticDirective = `
MONOCHROMATIC ENFORCEMENT:
- All background elements and typography must use shades of THE SAME COLOR: ${colorPrincipale}.
- Strictly NO secondary accent colors.
- Use variety in saturation and brightness for depth, but maintain strict hue consistency.`;

    const finalPrompt = `
${magazineReference}

${subjectRules}

${backgroundRules}

${typographyRules}
${monochromaticDirective}

${technicalQuality}

${prohibitions}
`;

    this.logger.log(
      '[buildEditorialCoverPrompt] Generated premium minimalist editorial cover prompt (locked layout)',
    );

    return finalPrompt;
  }
  private buildImpactCommercialPrompt(
    architecture: any,
    job: string,
    userQuery: string,
    mainWord: string,
    scriptPhrase: string,
    infoLine: string,
    textPromo: string = '',
    colorPrincipale: string = '#17A2B8',
    colorSecondaire: string = '#FFFFFF',
    customSubject: string = '',
    isPersonRequested: boolean = false,
  ): string {
    const texteFond = mainWord || '';
    const texteBadge = textPromo || '';
    const texteBouton = infoLine || '';

    const finalPrompt = `
Créer une affiche publicitaire moderne et minimaliste.

Sujet principal : ${customSubject || job}
Couleur du sujet : ${colorSecondaire}
Couleur de fond : ${colorPrincipale}

Composition obligatoire :
- Le sujet est centré.
- Le sujet est légèrement en lévitation avec une ombre douce réaliste.
- Un très grand mot en arrière-plan : "${texteFond.toUpperCase()}"
- Le texte en arrière-plan est blanc ou ton sur ton, très grand, légèrement texturé, partiellement caché derrière le sujet.
- En haut à droite, un petit rectangle noir avec le texte : "${texteBadge.toUpperCase()}"
- En bas centré, un bouton arrondi noir avec le texte : "${texteBouton.toUpperCase()}"

Style :
- Design épuré
- Ambiance premium
- Affiche Instagram moderne
- Haute résolution
- Aucun logo
- Aucune marque
- Chaque élément textuel mentionné doit être rendu PARFAITEMENT sur l'image.

STRICT TYPOGRAPHY RULE:
- VOUS NE POUVEZ REPRODUIRE QUE LE TEXTE EXACT PRÉVU CI-DESSUS.
- N'AJOUTEZ AUCUN TEXTE SUPPLÉMENTAIRE, SOUS-TITRE, TITRE DE MÉTIER. AUCUNE IMPROVISATION.
- LE TEXTE DOIT ÊTRE LISIBLE, SANS FAUTE ET 100% OPAQUE.

${customSubject && !isPersonRequested ? 'STRICT PROHIBITION: NO humans, NO people, NO fashion models, NO mannequins. Focus ONLY on the object/subject.' : ''}
`;

    this.logger.log(
      `[buildImpactCommercialPrompt] Generated impact commercial prompt — color: ${colorPrincipale}, texteFond: "${texteFond}"`,
    );

    return finalPrompt;
  }

  private buildEditorialMotionPrompt(
    architecture: any,
    job: string,
    userQuery: string,
    mainWord: string,
    scriptPhrase: string,
    infoLine: string,
    textPromo: string = '',
    colorPrincipale: string = '#17A2B8',
    colorSecondaire: string = '#FFFFFF',
    customSubject: string = '',
    isPersonRequested: boolean = false,
  ): string {
    const subject = customSubject || job;
    const environnement = userQuery || 'High-end studio';
    const descriptionSujet = userQuery || job;

    const finalPrompt = `
VERTICAL AD POSTER: Dynamic Cinematic Style.
SCENE: ${environnement}. MAIN SUBJECT: ${subject} (${descriptionSujet}).

COMPOSITION (ULTRA-STRICT – SIDE MOTION, INWARD FLOW, PADDING, CRISP BOTTOM):
- Subject perfectly sharp, 8K detail, ZERO motion blur touching the subject.
- CLEAN PADDING: Mandatory clean buffer zone (10–15%) around subject with no streaks.
- CRISP BOTTOM: Full bottom 15% of frame stays perfectly sharp with NO blur.
- MOTION EFFECT: Motion streaks ONLY on far left AND far right sides.
- DIRECTION RULE: ALL streaks MUST flow strictly TOWARD the center of the frame.
- No outward movement. No reversed motion. Always inward convergence.
- Motion trails start ONLY after the padding zone and intensify toward edges.
- Streaks must be straight horizontal/diagonal lines converging into the center zone, never radial, never random.
- NO blur behind subject, NO blur in front, NO blur at the bottom.
- Background behind subject may include soft bokeh but never merges with motion trails.
- Subject must POP with clean contour separation and a crisp base line.

TYPOGRAPHY (MANDATORY):
- RULES: ABSOLUTELY NO underlines, NO curved lines, NO dividers, NO highlights, NO boxes, NO ornaments.
- FONT: Bebas Neue, Tracking +120, Alignment Center.
- TOP: "${mainWord.toUpperCase()}" (Extra-large, ALL CAPS, Bold, Color: ultra-high contrast shade of ${colorPrincipale}). Positioned at the very top.
- MIDDLE: "${scriptPhrase}" (Elegant italic, Centered, positioned in the LOWER HALF of the frame, but separated from the bottom text by a LARGE VERTICAL GAP, Color: high contrast shade of ${colorSecondaire} or ${colorPrincipale}). NO underline, NO curved ornaments.
- BOTTOM: "${infoLine || 'OFFRE LIMITÉE'}" (High contrast shade of ${colorSecondaire}, Centered, at the absolute bottom margin, ALL CAPS).
- VAST NEGATIVE SPACE: Strategic breathing room between each block.
- LEGIBILITY: All text MUST use contrasting shades to be perfectly readable against speed streaks.

PALETTE: Dominant ${colorPrincipale} with its light/dark shades, Accent ${colorSecondaire} with its light/dark shades.
FORMAT: Vertical 9:16. QUALITY: Professional editorial, HD photorealistic.
KEYWORDS: inward motion blur, converging streaks, lateral speed lines, crisp bottom, sharp center.

${customSubject && !isPersonRequested ? 'PROHIBITION: NO humans/people. Object only.' : ''}
`;

    this.logger.log(
      `[buildEditorialMotionPrompt] Generated dynamic cinematic vertical poster prompt for subject: ${subject}`,
    );

    return finalPrompt;
  }

  private buildPrestigeBWPosterPrompt(
    subject: string,
    titleText: string,
  ): string {
    const finalPrompt = `
ULTRA MINIMALIST BLACK & WHITE LUXURY ADVERTISING POSTER.
SUBJECT: ${titleText}, front-facing hero shot, perfectly centered, symmetrical composition, slightly low angle.

BACKGROUND:
- Pure solid white background in the upper 70% (clean #FFFFFF).
- Smooth GRADIENT TRANSITION: Gradient from white (#FFFFFF) at the top to deep black (#000000) at the bottom.
- Gradient direction: TOP to BOTTOM (vertical).
- No smoke.
- No fog.
- No texture.
- No hard lines.
- No shadows on white area.
- Absolute studio white seamless backdrop in upper portion.

LIGHTING:
- High-end studio lighting.
- Soft but high-contrast lighting on subject.
- Clean rim light for subtle separation.
- Deep blacks and crisp whites.
- No atmospheric effects.

FLOOR:
- Solid pure black base (#000000) at the very bottom 20-30% of the poster.
- Completely opaque matte black surface (no gloss).
- NO reflections.
- NO water.
- NO shine.
- NO highlights.
- Pure graphic black area - completely flat and featureless.
- The gradient smoothly transitions from white to this solid black.

VISUAL STYLE:
- Ultra sharp details.
- Fine art photography aesthetic.
- Luxury fashion campaign mood.
- Photorealistic.
- Clean, bold, iconic presence.
- Extreme minimalism.

TYPOGRAPHY (MANDATORY):
- Large elegant serif typography (Didot / Bodoni inspired).
- White uppercase text.
- Centered alignment.
- Positioned inside the black bottom area.
- Clean kerning.
- EXACT TEXT TO DISPLAY:
"${titleText.toUpperCase()}"
- This text is a message/slogan, NOT a company or brand name.
- Render it exactly as provided.
- No distortion.
- No extra words.
- No additional typography.

COMPOSITION:
- Minimal.
- Premium.
- Editorial luxury campaign.
- Zero distractions.
- High-end brand aesthetic.

--ar 2:3 --style raw
`;

    this.logger.log(
      `[buildLuxuryBWPosterPrompt] Generated clean white luxury poster prompt for subject: ${titleText}`,
    );

    return finalPrompt;
  }

  /**
   * 🎨 BUILD SIGNATURE SPLASH PROMPT FOR DALL-E
   * Creates ultra-realistic splash effect advertising posters
   * Features dynamic splash effects (liquid, powder, fire, etc.)
   */
  private buildSignatureSplashPrompt(
    subject: string,
    titleText: string,
    subtitleText: string = '',
  ): string {
    const finalPrompt = `Create an ultra realistic premium advertising poster.

MAIN SUBJECT:
${subject}
(Single food item or single dish only. No packaging. No multiple subjects. Full focus on the main subject.)

COMPOSITION RULES (STRICT):
- One single centered main subject, perfectly framed
- The dish/food must remain clean, sharp, untouched, and visually perfect
- One cinematic dynamic splash effect physically interacting AROUND the subject
- Splash must surround the subject, not cover it
- Splash must not obscure the main subject
- Splash must not dirty the food
- Effects must stay in the surrounding space (foreground/background motion)
- Dynamic effects allowed:
  (stylized sauce drips, glossy oil flow, slow liquid motion, fine steam, vapor, aromatic particles, soft droplets)
- Splash must look realistic, frozen in motion, high-speed photography style
- Maximum two secondary elements strictly related to the subject
- No extra objects
- No background clutter
- Clean composition
- Subject remains dominant and visually powerful
- Visual hierarchy: subject first, effects second

FOOD VISUAL RULES:
- Food must look clean, fresh, appetizing, premium
- No messy textures on the food
- No sauce covering the dish
- No dripping on the dish surface
- No chaotic liquids touching the food
- No dirty effects
- No overflow on the plate
- No “food disaster” look
- No exaggerated melting
- Controlled aesthetic only
- High visual hygiene

VISUAL STYLE:
- Ultra realistic studio photography
- Hyper-detailed food textures
- Real materials and surfaces
- Natural shadows and reflections
- Professional commercial food advertising photography
- Cinematic lighting setup (rim light + soft key light + ambient fill)
- Shallow depth of field
- High contrast
- Optical realism
- Not CGI
- Not 3D render
- Not illustration
- Natural imperfections allowed
- Photographic realism only

BACKGROUND:
- Solid or soft cinematic gradient background
- Color palette adapted to subject theme
- Dark premium tones preferred
- Clean, minimal, luxury studio look
- No patterns
- No textures
- No objects

TYPOGRAPHY LAYOUT:
Top: Large bold uppercase serif headline → "${titleText}"
Center (over subject): Elegant italic handwritten subtitle → "${subtitleText}"
No other text
No decorative overlays
No frames
No logos
No badges
No UI elements
No watermarks

STYLE MOOD:
Premium
Luxury
High-end brand identity
Impactful
Modern advertising
Minimal
Powerful
Cinematic
High visual impact
Professional commercial poster
Stylish
Elegant
Appetizing
`;

    this.logger.log(
      `[buildSignatureSplashPrompt] Generated CLEAN SUBJECT + CINEMATIC SPLASH AROUND prompt for subject: ${subject}`,
    );

    return finalPrompt;
  }

  /**
   * 🎨 BUILD EDITORIAL GRID PROMPT FOR DALL-E
   * Crée une affiche de luxe premium avec layout asymétrique 3 panneaux
   */
  private buildEditorialGridPrompt(
    subject: string = 'luxury subject',
    titleText: string = '',
    subtitleText: string = '',
    colorPrincipale: string = '#1a3a52',
    colorSecondaire: string = '#ffffff',
  ): string {
    const finalPrompt = `Create a high-end luxury promotional poster with a bold asymmetrical editorial layout featuring a realistic ${subject} at sunset with elegant reflection.

IMPORTANT STRUCTURE:

– Divide the main subject image into 3 separate vertical panels.
– Equal width.
– Equal spacing.
– Clean straight edges.
– Visible background between panels.
– NO black divider lines.
– NO perspective distortion.

VERY IMPORTANT:

The panels must have a strong vertical offset:

– The center panel must be significantly higher.
– The left panel must be clearly lower.
– The right panel must be clearly higher or lower than the left.
– The vertical difference must be obvious and intentional.
– The layout must feel dynamic and editorial, not symmetrical.
– The offset should look like a modern luxury magazine composition.

TEXT RESTRICTION:

– Do NOT generate any automatic text describing the subject.
– No captions, labels, or watermarks.
– No extra words or phrases.
– Only the following text is allowed in the image:
  ${titleText.toUpperCase()}
  ${subtitleText}

BACKGROUND:
– Smooth luxury gradient.
– Primary color: ${colorPrincipale}.
– Secondary color: ${colorSecondaire}.
– Strong elegant gradient blend.
– Subtle grid texture overlay.
– Premium minimal aesthetic.

TYPOGRAPHY (PLACED ON BACKGROUND ONLY):

Bottom centered:

${titleText.toUpperCase()} (very large bold serif, uppercase, luxury style similar to Didot)

${subtitleText} (elegant italic script below)

STYLE:
– High-end editorial magazine.
– Luxury branding.
– Dynamic composition.
– Clean.
– Bold.
– Ultra sharp.
– High resolution.
`;
    return finalPrompt;
  }

  /**
   * 🎨 BUILD FOCUS CIRCLE PROMPT FOR DALL-E
   * Modern editorial layout with symmetrical split and circular focus zone.
   */
  private buildFocusCirclePrompt(
    subject: string = 'modern subject',
    titleText: string = '',
    subtitleText: string = '',
    infoLine: string = '',
    colorPrincipale: string = '#FF9800',
    colorSecondaire: string = '#FFFFFF',
    brandingName: string = '',
  ): string {
    const finalPrompt = `
CREATE A HIGH-END MODERN MONOCHROMATIC EDITORIAL POSTER.
LUXURY PODCAST / MAGAZINE ADVERTISING STYLE.
SWISS DESIGN INFLUENCE. CLEAN. POWERFUL. PRECISE.

========================
1. GLOBAL LAYOUT STRUCTURE
========================

- The canvas is divided into TWO EQUAL HORIZONTAL HALVES (TOP and BOTTOM).
- There must be NO visible border, NO stroke, NO hard separator between the halves.
- The separation must be achieved ONLY by subtle shade variation.
- Both halves use the EXACT SAME BASE COLOR: ${colorPrincipale}.
- The bottom half should be slightly darker or slightly richer than the top half.
- Entire design must remain strictly monochromatic based on ${colorPrincipale}.
- Use cinematic lighting, deep shadows, and refined highlights.
- No flat overlays.

========================
2. SUBJECT PLACEMENT
========================
- The primary subject: "${subject}"
- CRITICAL: The subject MUST be positioned EXACTLY at the CENTER of the frame.
- The subject MUST NOT drift to the right. It must stay strictly in the middle horizontally.
- Perfect horizontal centering is MANDATORY. The subject is equidistant from left and right edges.
- Only upper torso / shoulders / head visible.
- The subject must appear visually cropped by the horizontal midpoint.
- The subject MUST be centered on the X-axis (50% line) with NO offset.
- Keep generous negative space around it equally on both sides.
- DO NOT render the subject description as text on the image.
========================
3. TYPOGRAPHY SYSTEM (ULTRA STRICT)
========================

TEXT CONTENT RULE:
Render ONLY the text provided below.
Do NOT invent text.
Do NOT repeat the subject name.
No extra words.

TYPOGRAPHY RULES (ABSOLUTE):
- NO underlines.
- NO decorative lines.
- NO horizontal separators.
- NO strokes.
- NO highlight bars.
- NO background strips behind text.
- Text must float freely with clean spacing.
- Perfect alignment.
- Clear visual hierarchy.

MAIN TITLE:
"${titleText.toUpperCase()}"
- Position: Centered in the BOTTOM half, around 65-70% from top.
- Very large bold modern sans-serif.
- Color: ${colorSecondaire}
- Perfect horizontal centering.
- Must not touch any line or graphic element.
- Generous white space below for the info line.

SUBTITLE:
"${subtitleText}"
- Position: Above main title inside bottom half, around 55-60% from top.
- Medium elegant sans-serif.
- Color: ${colorSecondaire} at 85% opacity.
- Absolutely NO underline.

INFO LINE (DATE/TIME):
"${infoLine}"
- Position: Very bottom of image, around 92-95% from top.
- Small minimalist sans-serif.
- Color: ${colorSecondaire} at 75% opacity.
- Fully visible and not cut off by any edge.
- Safe from any cropping or clipping.

${
  brandingName
    ? `
BRANDING BADGE:
- Text: "${brandingName.toUpperCase()}"
- Small dark rectangular box.
- Positioned at EXTREME TOP-LEFT corner.
- Around 2% from top and 3% from left.
- Must sit very close to the edge.
`
    : ''
}

========================
4. VERTICAL CENTER LINE (CRITICAL RULE)
========================

- A thin 2px vertical divider aligned at EXACT 50% width.
- The line must run from TOP down to approximately 80-85% of the image height.
- The line must STOP BEFORE the date/info line at the bottom (must not reach the date).
- CRITICAL: The vertical line must BREAK/JUMP around all text elements (Title, Subtitle, Info Line).
- When the line encounters the MAIN TITLE, it must STOP, skip over the title entirely, then RESUME below it.
- When the line encounters the SUBTITLE, it must STOP, skip over the subtitle entirely, then RESUME below it.
- When the line encounters the INFO LINE/DATE, it must STOP and not continue further.
- Create clear white space gaps around ALL typography so the line appears as multiple separate segments.
- The line segments must be clearly separated by white space between each text element.
- Minimum 40px clear space between the line segments and any text.
- The line is purely decorative and must never touch or overlap typography.

========================
5. STYLE DIRECTION
========================

- High-end editorial aesthetic.
- Modern luxury podcast advertising look.
- Strong negative space.
- Perfect geometric balance.
- Premium lighting.
- Clean and powerful hierarchy.
- No clutter.
- No extra shapes.
- No unnecessary graphic elements.

IMPORTANT:
The subject must stay on the RIGHT side.
The text must stay fully readable.
The vertical line must NEVER cut through typography.
`;

    return finalPrompt;
  }

  /**
   * 🟢 DIAGONAL SPLIT DESIGN PROMPT
   * High-end modern design with diagonal band split and dynamic subject positioning
   * Subject in TOP-RIGHT, diagonal band traversing composition, typography in BOTTOM-LEFT/CENTER
   * Uses user-selected colors: colorPrincipale for band, colorSecondaire for text
   */
  private buildDiagonalSplitDesignPrompt(
    subject: string = 'modern subject',
    titleText: string = '',
    subtitleText: string = '',
    infoLine: string = '',
    colorPrincipale: string = '#FF9800',
    colorSecondaire: string = '#FFFFFF',
    brandingName: string = '',
  ): string {
    const finalPrompt = `
CREATE A HIGH-END MODERN DIAGONAL SPLIT DESIGN POSTER.
DYNAMIC SPORTS / ACTION ADVERTISING STYLE.
CLEAN. POWERFUL. PRECISE. MODERN.

========================
1. GLOBAL LAYOUT STRUCTURE
========================

- Clean light background (white, light grey, or off-white base).
- ONE LARGE DIAGONAL BAND traversing the composition from TOP-LEFT to BOTTOM-RIGHT.
- The diagonal band is SEMI-TRANSPARENT (60-70% opacity) in color: ${colorPrincipale}.
- Diagonal band creates dynamic visual split between subject area (top) and text area (bottom).
- The band flows smoothly with sharp, clean edges.
- Professional studio aesthetic with premium finish and cinematic lighting.

========================
2. SUBJECT PLACEMENT & ENVIRONMENT (TOP-RIGHT WITH RICH CONTEXT)
========================

PRIMARY SUBJECT:
- The primary subject: "${subject}"

SUBJECT STYLE (PHOTOREALISTIC & AUTHENTIC):
- The subject must look like a REAL PHOTOGRAPH captured by a professional photographer.
- This is NOT a stylized illustration, NOT a cinematic render, NOT an AI artifact.
- The subject must have AUTHENTIC HUMAN QUALITIES: natural skin texture, realistic proportions, genuine expression.
- Avoid over-processed, plastic, or artificial appearance.
- Avoid exaggerated cinematic lighting, extreme color grading, or hyper-enhanced effects.

POSTURE & EXPRESSION:
- The subject should display a NATURAL, CONFIDENT, and APPROACHABLE demeanor.
- Posture: relaxed yet confident standing or dynamic action pose (if relevant to the subject).
- Facial expression: calm, focused, or natural smile — NOT aggressive, NOT overly intense.
- Gaze: direct to camera or naturally directed, maintaining eye contact confidence.
- Body language: comfortable, balanced, and naturally proportioned.

PHOTOGRAPHY & LIGHTING QUALITY:
- Lighting must be NATURAL and REALISTIC — like professional studio or daylight photography.
- Soft directional light (3-point lighting: key light + fill light + subtle rim light).
- No harsh shadows, no blown highlights, no artificial glows.
- Natural color temperature (no weird color casts).
- Balanced exposure with realistic shadows and highlights.
- Depth of field: sharp subject with naturally soft background (organic depth, NOT artificial blur).

TEXTURE & DETAIL REALISM:
- Skin texture: natural, with subtle imperfections (pores, micro-textures) — NOT plasticked or smoothed.
- Clothing: realistic fabric texture and natural wrinkles/creases.
- Hair: natural movement and texture, NOT stiff or overly groomed.
- Eyes: intelligent, alive, and natural — NOT glossy or artificial.
- Overall: High-frequency details that feel authentically captured, not digitally enhanced.

ENVIRONMENT & CONTEXTUAL BACKGROUND (CRITICAL):
- The background is NOT a generic blur or empty studio — it is a RICH, DETAILED ENVIRONMENT.
- The environment must be DIRECTLY RELEVANT to the subject and convey profession/context.
- Examples: factory floor for manufacturing, restaurant kitchen for chef, workshop for craftsman, retail store for salesperson, medical facility for healthcare worker, etc.
- Environmental details MUST be CLEAR and VISIBLE in the background:
  * Tools, equipment, products, or machinery relevant to the subject's field.
  * Interior elements: shelves, displays, workstations, counters, lighting fixtures, architectural details.
  * Atmospheric elements: depth, perspective, realistic spatial arrangement.
  * Professional setting details that establish credibility and context.
- Background clarity: SHARP to SOFT FOCUS, but NOT blurred into illegibility.
- The environment occupies 40–50% of the visual frame depth, NOT just a thin backdrop.
- Natural lighting reflects the actual environment (indoor facility lighting, natural window light, etc.).
- Colors in background complement the ${colorPrincipale} diagonal band — NO color clashing.

SUBJECT POSITIONING & INTEGRATION:
- Subject positioned NATURALLY in TOP-RIGHT or CENTER-RIGHT area (flexible, NOT forced cropping).
- Subject size is NATURALLY PROPORTIONED to the composition and environment.
- The diagonal band (${colorPrincipale}) may overlay the subject (40–50% opacity) WITHOUT visual clash.
- Natural shadows cast by the subject enhance 3D integration with the environment.
- Subject and environment integrate seamlessly — NO cut-out look, NO visible compositing seams, NO floating appearance.
- Subject appears as PART OF the environment, not separate or pasted.
- Environmental elements (equipment, furniture, etc.) may naturally frame or surround the subject.

COLOR & TONE:
- Realistic color palette based on actual human appearance, clothing, and environmental context.
- NO oversaturation, NO artificial color enhancement.
- Warm or neutral color temperature for approachable, authentic feel.
- Skin tones: natural and accurate.
- Environment colors: realistic and grounded in actual material colors (metal, wood, fabric, equipment, etc.).
- The user's selected colors (${colorPrincipale}/${colorSecondaire}) used for DESIGN ELEMENTS (band, text), NOT forced into the subject or environment.

CRITICAL PROHIBITIONS (REALISM):
- NO AI-generated artifacts (distorted fingers, morphed faces, unnatural proportions).
- NO plastic appearance or glossy skin.
- NO exaggerated cinematic effects (extreme vignetting, unrealistic glows, impossible physics).
- NO hyper-sharpened or over-processed look.
- NO stock photo watermarks or generic stock appearance.
- NO mannequin-like stiffness or unnatural poses.
- NO empty, blurry, or low-quality background — background MUST be DETAILED and CONTEXTUAL.
- NO generic white/grey empty studio — environment MUST be profession-specific and photorealistic.

STRICT RULE:
- DO NOT render the subject description as text in the image.

========================
3. TYPOGRAPHY SYSTEM (POSITIONED BOTTOM-LEFT/CENTER)
========================

TEXT CONTENT RULE:
Render ONLY the text provided below.
Do NOT invent text.
Do NOT repeat the subject name.
No extra words.

TYPOGRAPHY RULES (ABSOLUTE):
- NO underlines.
- NO decorative lines.
- NO horizontal separators.
- NO strokes.
- NO highlight bars.
- NO background strips behind text.
- Text must float freely with clean spacing.
- Perfect alignment and maximum readability.
- Clear visual hierarchy.

MAIN TITLE:
"${titleText.toUpperCase()}"
- Position: BOTTOM-LEFT to BOTTOM-CENTER area (lower 30% of image vertically).
- Horizontal position: LEFT or CENTER-LEFT, NOT right-aligned.
- Alignment: LEFT-aligned or CENTER text block.
- Very large, ultra-bold, modern sans-serif (like Bebas Neue, Montserrat Bold, or Impact).
- Color: ${colorSecondaire}
- Weight: ULTRA-BOLD, MAXIMUM VISUAL IMPACT.
- 100% OPAQUE, bright and crisp, highly legible against light background.
- Font size: Approximately 15-18% of image height.

SUBTITLE:
"${subtitleText}"
- Position: Directly BELOW main title in the BOTTOM area (lower 35-45% of image).
- Alignment: LEFT-aligned or CENTER, matching main title alignment.
- Medium elegant sans-serif or refined serif.
- Color: ${colorSecondaire} at 90% opacity.
- Absolutely NO underline, NO italic distortions.
- Elegant and refined, contrasting with the bold title.
- Generous spacing above (between title and subtitle) and below.

INFO LINE:
"${infoLine}"
- Position: Below subtitle or as part of text block footer.
- Small minimalist sans-serif.
- Color: ${colorSecondaire} at 80% opacity.
- Minimal weight, supporting text role only.

${
  brandingName
    ? `
BRANDING BADGE:
- Text: "${brandingName.toUpperCase()}"
- Small text or minimal rectangular element.
- Positioned at TOP-LEFT or TOP-RIGHT corner.
- Does NOT interfere with subject positioning.
- Color: ${colorSecondaire} or subtle shade of ${colorPrincipale}.
`
    : ''
}

========================
4. DIAGONAL BAND SPECIFICATIONS
========================

- One large semi-transparent diagonal band.
- Direction: Flows from TOP-LEFT corner toward BOTTOM-RIGHT corner at approximately 25-35 degree angle.
- Opacity: 60-70% semi-transparency for modern premium effect.
- Color: Primary Color (${colorPrincipale}).
- Width: Approximately 40-50% of image width at widest point.
- Clean, sharp edges - NOT blurred, NOT soft feathered.
- The band visually separates the subject (top-right) from typography (bottom-left/center).
- Band does NOT obscure, overlap, or interfere with the subject.
- Band creates dynamic visual energy and modern aesthetic.
- Band flows naturally with smooth gradient transitions.

========================
5. COLOR SYSTEM & CONTRAST
========================

- Background: Clean light/white or light grey (neutral base for readability).
- Primary Band Color: ${colorPrincipale} (semi-transparent overlay).
- Subject: Full photorealistic color, vibrant and detailed.
- Typography: ${colorSecondaire} (high contrast against light background and semi-transparent band).
- Typography MUST have MAXIMUM READABILITY and VISIBILITY.
- Use user's selected colors: ${colorPrincipale} for brand accent band, ${colorSecondaire} for text.

========================
6. STYLE DIRECTION & EXECUTION
========================

- High-end modern advertising aesthetic.
- Dynamic sports/action energy balanced with premium minimalism.
- Strong visual contrast between subject and typography areas.
- Geometric precision from the diagonal band.
- Professional magazine / billboard quality.
- Clean composition with strategic negative space.
- Modern luxury branding feel.
- No clutter, no unnecessary graphic elements.

CRITICAL EXECUTION RULES:
- Subject MUST stay in TOP-RIGHT quadrant (NOT centered, NOT left).
- Diagonal band MUST traverse cleanly from TOP-LEFT to BOTTOM-RIGHT.
- Typography MUST be in BOTTOM-LEFT/CENTER area (NOT top, NOT right-side).
- Main title MUST be large and bold for maximum impact.
- All text colors MUST be ${colorSecondaire} (user-selected secondary color).
- Band color MUST be ${colorPrincipale} (user-selected primary color).
- All text 100% opaque and fully readable.
- Create distinct visual balance: subject upward (top-right), text downward (bottom-left).
`;

    return finalPrompt;
  }

  /**
   * 🎨 BUILD STUDIO POSTER PROMPT FOR DALL-E
   * Modern editorial promotional poster with minimal graphic design style
   * Features a clean subject with geometric shapes behind
   */
  private buildStudioPosterPrompt(
    subject: string = 'modern subject',
    titleText: string = '',
    subtitleText: string = '',
    colorPrincipale: string = '#FF9800',
    colorSecondaire: string = '#FFFFFF',
  ): string {
    const finalPrompt = `
CREATE A MODERN EDITORIAL PROMOTIONAL POSTER.
MINIMAL GRAPHIC DESIGN STYLE.
CLEAN. PROFESSIONAL. MINIMALIST.

========================
1. BACKGROUND
========================

- ABSOLUTELY white or very light grey studio background (#FFFFFF or #F5F5F5).
- STRICTLY clean and empty.
- NO gradients.
- NO textures.
- NO patterns.
- NO colored elements in the background.
- Professional minimal poster aesthetic.
- Studio photography look.

========================
2. MAIN SUBJECT
========================

- The main subject: "${subject}"

SUBJECT PRESENTATION:
- The subject must be cleanly cut out / isolated from background.
- Positioned CENTERED in the composition vertically and horizontally.
- Subject size: FLEXIBLE and naturally proportioned (not too small, not overly large).
- The subject should be CLEAN, CLEAR, and WELL-DEFINED against the light background.
- Photography quality: PHOTOREALISTIC and professional.
- The subject MUST SLIGHTLY OVERLAP the geometric shapes behind (shapes visible around and under subject).
- No harsh cut-out look — subject integrates naturally with the composition.
- Focus: SHARP and detailed.
- Lighting: Natural, soft, professional studio lighting (no harsh shadows, no artificial effects).

STRICT RULE:
- DO NOT render the subject description as text in the image.

========================
3. GEOMETRIC SHAPES (COLOR: ${colorPrincipale})
========================

TWO GRAPHIC ELEMENTS positioned BEHIND the subject:

1 — LARGE CIRCLE:
   - Centered vertically and horizontally in the composition.
   - Diameter: Approximately 30–40% of image width.
   - Positioned BEHIND the subject (subject slightly overlaps).
   - Color: ${colorPrincipale} (Primary Color).
   - Flat geometric element (NO shadows, NO gradients, NO 3D effects).
   - Clean, sharp edges.
   - 100% opaque fill.

2 — TALL VERTICAL ROUNDED RECTANGLE:
   - Centered vertically and horizontally in the composition.
   - Width: Approximately 15–25% of image width.
   - Height: Extends ABOVE the circle, approximately 50–60% of image height.
   - Top part positioned well above the circle.
   - Bottom extends slightly below or aligned with circle center.
   - Corners: ALL CORNERS ROUNDED (borderRadius effect).
   - Color: SAME as circle — ${colorPrincipale} (Primary Color).
   - Flat geometric element (NO shadows, NO gradients, NO 3D effects).
   - Clean, sharp edges.
   - 100% opaque fill.

SHAPE RELATIONSHIP:
- Both shapes use IDENTICAL COLOR: ${colorPrincipale}.
- Shapes are FLAT GRAPHIC ELEMENTS (no drop shadows, no layer effects, no 3D depth).
- Shapes are positioned symmetrically behind the subject.
- The subject SLIGHTLY OVERLAPS both shapes (subject is in front).
- Shapes create a modern, minimal graphic accent behind the subject.

========================
4. TYPOGRAPHY (OPTIONAL)
========================

${
  titleText
    ? `
MAIN TITLE:
"${titleText.toUpperCase()}"
- Position: TOP or BOTTOM of composition (based on available space).
- Alignment: CENTERED or positioned strategically around the subject.
- Font: Modern sans-serif, minimal, elegant.
- Size: LARGE but not overwhelming (approximately 8–12% of image height).
- Color: BLACK or dark grey (#000000 or #333333).
- Weight: BOLD or semi-bold.
- 100% opaque and fully legible.
- NO shadows, NO outlines, NO effects.
`
    : ''
}

${
  subtitleText
    ? `
SUBTITLE:
"${subtitleText}"
- Position: Below or above main title (minimal positioning).
- Font: Elegant sans-serif or light serif, smaller than title.
- Size: Approximately 4–6% of image height.
- Color: BLACK or dark grey (#000000 or #333333) at 80% opacity.
- Weight: Regular or light.
- NO underlines, NO decorations.
`
    : ''
}

TYPOGRAPHY RULES (ABSOLUTE):
- NO additional text or watermarks.
- Clean, minimal typography only.
- Text must not overlap shapes or subject in confusing ways.
- Maximum 2 text elements (title + subtitle).

========================
5. LAYOUT & COMPOSITION
========================

- CENTERED composition with the subject and shapes as the focal point.
- White/light grey background fills entire frame.
- Strong visual balance between subject and geometric accent shapes.
- Strategic negative space around subject and shapes.
- Professional, minimal aesthetic — suitable for print and digital design.
- Magazine-quality or billboard-ready layout.

EXECUTION RULES:
- Subject MUST be centered (not off-axis, not awkwardly positioned).
- Shapes MUST be centered behind subject.
- Subject MUST overlap shapes slightly (shapes visible around edges).
- All elements (subject, shapes, text) must integrate cohesively.
- Background MUST remain clean white/light grey.
- NO clutter, NO extra elements, NO unnecessary details.
- Professional minimal poster design quality.
`;

    return finalPrompt;
  }

  /**
   * 🔵 POST-PROCESS: Focus Circle Filter
   * Applies a circular B&W desaturation "lens" on the top-left of the image.
   * The area INSIDE the circle becomes grayscale; everything OUTSIDE stays in color.
   * This is a pure sharp composition — no AI involved.
   */
  private async compositeFocusCircleFilter(
    inputBuffer: Buffer,
    colorPrincipale: string = '#FF9800',
  ): Promise<Buffer> {
    this.logger.log(
      '[compositeFocusCircleFilter] Applying B&W circle filter...',
    );

    // Get image dimensions
    const meta = await sharp(inputBuffer).metadata();
    const W = meta.width || 1024;
    const H = meta.height || 1536;

    // Circle parameters: Center the circle horizontally, position it higher up
    // Diameter = 42% of width.
    const diameter = Math.round(W * 0.42);
    const radius = Math.floor(diameter / 2);
    // Center of circle: centered horizontally, positioned at 30% from top (higher up)
    const cx = Math.round(W * 0.35);
    const cy = Math.round(H * 0.3);

    // 2. Create a circular mask (white circle on black background) for the B&W area
    const circleMaskSvg = `<svg width="${W}" height="${H}">
  <circle cx="${cx}" cy="${cy}" r="${radius}" fill="white"/>
</svg>`;
    const circleMaskBuffer = await sharp(Buffer.from(circleMaskSvg))
      .png()
      .toBuffer();

    // 3. Composite B&W image on top of color image, masked by the circle
    //    Step 3a: Mask the B&W image (cut it to the circle shape)
    //    We do this by multiplying the B&W and the circle mask
    //    Actually with sharp: composite bwBuffer over color using circle mask as alpha
    //    Approach: make bw image RGBA with circle mask as alpha channel, then composite over color

    // 3a. Convert B&W to RGBA (grayscale but with alpha = circle mask)
    //     We create the B&W version at full size with circular alpha mask
    const bwCircleBuffer = await sharp(inputBuffer)
      .greyscale()
      .toFormat('png')
      .toBuffer();

    // 3b. Apply the circular mask as alpha to the B&W image
    const maskedBwBuffer = await sharp(bwCircleBuffer)
      .ensureAlpha()
      .composite([
        {
          input: circleMaskBuffer,
          blend: 'dest-in', // Keep only pixels where mask is white
        },
      ])
      .toBuffer();

    // 4. Composite the masked B&W circle on top of the original color image
    //    to produce the final: color everywhere + B&W in the circle zone
    const withCircle = await sharp(inputBuffer)
      .ensureAlpha()
      .composite([
        {
          input: maskedBwBuffer,
          blend: 'over',
          top: 0,
          left: 0,
        },
      ])
      .toBuffer();

    // 5. Add a thin circle border ring in the primary color for aesthetics
    const borderSvg = `<svg width="${W}" height="${H}">
  <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${colorPrincipale}" stroke-width="3"/>
</svg>`;
    const borderBuffer = Buffer.from(borderSvg);

    // 6. Add thin center line (Vertical ONLY) in primary color
    const centerX = Math.floor(W / 2);
    const lineSvg = `<svg width="${W}" height="${H}">
  <line x1="${centerX}" y1="0" x2="${centerX}" y2="${H}" stroke="${colorPrincipale}" stroke-width="2" opacity="0.6"/>
</svg>`;
    const lineBuffer = Buffer.from(lineSvg);

    // 7. Final composite: withCircle + border ring + center line -> JPEG output
    const finalBuffer = await sharp(withCircle)
      .composite([
        { input: borderBuffer, blend: 'over', top: 0, left: 0 },
        { input: lineBuffer, blend: 'over', top: 0, left: 0 },
      ])
      .flatten({ background: { r: 0, g: 0, b: 0 } })
      .jpeg({ quality: 90 })
      .toBuffer();

    this.logger.log(
      '[compositeFocusCircleFilter] B&W circle filter applied successfully.',
    );
    return finalBuffer;
  }

  /**
   * 🔵 POST-PROCESS: Editorial Reveal Filter
   * Applies a tall vertical rectangle in the center.
   * Inside: Sharp, full color.
   * Outside: Blurred, Black and White (as generated by AI).
   * Note: The AI is instructed to generate B&W Blurred already, so we mainly
   * need to restore color in the center if we had a color source, or simply
   * add the border and ensure the transition.
   * REALLY, we want to take the original (which AI made B&W/Blurred)
   * and we can't "restore" color if it wasn't there.
   * BUT if we want the "Reveal" effect, we actually need the AI to generate COLOR,
   * then WE blur/desaturate outside.
   */
  private async compositeEditorialRevealFilter(
    inputBuffer: Buffer,
  ): Promise<Buffer> {
    this.logger.log(
      '[compositeEditorialRevealFilter] Applying Editorial Reveal filter...',
    );

    const meta = await sharp(inputBuffer).metadata();
    const W = meta.width || 1024;
    const H = meta.height || 1536;

    // Rectangle dimensions: Tall vertical rectangle in the center
    const rectW = Math.round(W * 0.45);
    const rectH = Math.round(H * 0.85);
    const rx = Math.round((W - rectW) / 2);
    const ry = Math.round((H - rectH) / 2);

    // 1. Create the B&W Blurred background version (base layer)
    const bgBuffer = await sharp(inputBuffer).greyscale().blur(0.3).toBuffer();

    // 2. Create the rectangular mask
    const maskSvg = `<svg width="${W}" height="${H}">
      <rect x="${rx}" y="${ry}" width="${rectW}" height="${rectH}" fill="white" />
    </svg>`;
    const maskBuffer = await sharp(Buffer.from(maskSvg)).png().toBuffer();

    // 3. Create the reveal layer (sharp color only inside the rectangle)
    // We MUST specify .png() to preserve the alpha channel for the next composite step
    const maskedColor = await sharp(inputBuffer)
      .ensureAlpha()
      .composite([
        {
          input: maskBuffer,
          blend: 'dest-in',
        },
      ])
      .png()
      .toBuffer();

    // 4. Create the border overlay
    const borderSvg = `<svg width="${W}" height="${H}">
      <rect x="${rx}" y="${ry}" width="${rectW}" height="${rectH}" fill="none" stroke="white" stroke-width="4" />
    </svg>`;
    const borderBuffer = Buffer.from(borderSvg);

    // 5. Final composite: Background + Reveal + Border
    const finalBuffer = await sharp(bgBuffer)
      .composite([
        { input: maskedColor, top: 0, left: 0 },
        { input: borderBuffer, blend: 'over', top: 0, left: 0 },
      ])
      .jpeg({ quality: 90 })
      .toBuffer();

    this.logger.log(
      '[compositeEditorialRevealFilter] Editorial Reveal filter applied successfully.',
    );
    return finalBuffer;
  }

  /**
   * 🎨 BUILD DIAGONAL SPLIT PROMPT FOR DALL-E
   * Modern minimalist layout with a diagonal geometric band.
   */
  private buildDiagonalSplitPrompt(
    subject: string = 'modern subject',
    titleText: string = '',
    subtitleText: string = '',
    colorPrincipale: string = '#FF9800',
    colorSecondaire: string = '#000000',
  ): string {
    let textSections = '';

    if (titleText) {
      textSections += `
5. MAIN TITLE:
   Text: "${titleText}"
   Position: High-impact headline in the lower-middle area.
   Typography: Large bold modern sans-serif. Centered.
   Color: ${colorSecondaire}.
`;
    }

    if (subtitleText) {
      textSections += `
6. SUBTITLE:
   Text: "${subtitleText}"
   Position: Directly below the main title.
   Typography: Modern clean sans-serif, smaller than title.
   Color: ${colorSecondaire}.
`;
    }

    const finalPrompt = `Create a modern minimalist advertising poster with a clean and balanced composition.

FORMAT:
Vertical poster layout (A4 or Instagram poster format).
High-end modern branding design.

BACKGROUND:
Clean white studio background. Minimalist and professional.

MAIN SUBJECT:
${subject}.
Only ONE main subject.
Positioning: Place the subject slightly off-center.
Style: Professional studio photography with strong, clean lighting and high resolution.

LAYOUT STRUCTURE:

1. DIAGONAL GEOMETRIC BAND:
   Add a large semi-transparent diagonal band crossing the composition.
   Direction: From absolute TOP-LEFT to BOTTOM-RIGHT.
   Effect: Partially overlay the main subject to create a modern graphic design depth effect.
   Color: use ${colorPrincipale} (Primary Color).

${textSections}

STYLE:
Geometric composition. Modern branding poster. Minimalist layout. Professional studio lighting. Ultra sharp. High visual hierarchy.

IMPORTANT RULES:
- The background MUST remain clean white.
- The diagonal band MUST be semi-transparent and overlay the subject.
- Keep the composition balanced and professional.
- No other decorative elements or clutter.

OUTPUT:
High resolution. Professional publication-ready marketing poster.`;

    return finalPrompt;
  }

  /**
   * 🎨 BUILD EDITORIAL REVEAL PROMPT FOR DALL-E
   * Modern editorial layout with a blurred B&W background and a sharp color window.
   */
  private buildEditorialRevealPrompt(
    subject: string = 'modern subject',
    colorPrincipale: string = '#FFFFFF',
    colorSecondaire: string = '#000000',
  ): string {
    const finalPrompt = `CREATE A MODERN EDITORIAL PROMOTIONAL POSTER.

THE SUBJECT:
Generate a striking visual element - a modern subject.
Only ONE visual element must appear, perfectly centered.
The visual can be a person, object, product, architecture, animal, fashion item, food, etc.

CRITICAL RULE:
DO NOT RENDER OR DISPLAY ANY TEXT RELATED TO THE SUBJECT.
NO subject name, NO description text, NO typography of subject description.
Only the visual representation, no text whatsoever.

BACKGROUND (ULTRA-STRICT):
- The entire image must be FULL COLOR and EXTREMELY SHARP.
- High detail, professional studio photography.
- The background must cover the FULL image area.
- IMPORTANT: DO NOT BLUR THE IMAGE. DO NOT MAKE IT BLACK AND WHITE.
- ONE single continuous high-resolution color image is MANDATORY.

STYLE:
Modern editorial poster. Minimal graphic design. Magazine advertising style. Professional photography. Clean composition.

TECHNICAL DETAILS:
High-end studio lighting. Professional editorial quality. 8K resolution.

IMPORTANT: Do NOT generate any rectangles, borders, or "focus windows" in the image. These will be added in post-production. Simply generate the centered subject in FULL COLOR and SHARP FOCUS.
`;
    return finalPrompt;
  }

  /**
   * 🎨 GET MANNEQUIN VARIATION DIRECTIVE - REUSABLE
   * Returns a string with variation instructions if no gender is specified
   * Can be used in any prompt builder
   */
private getMannequinVariationDirective(
  subject: string,
  isPersonRequested: boolean,
): string {

  const castingSeed = Math.floor(Math.random() * 100000);

  const genderKeywords = /femme|woman|fille|girl|male|mâle|homme|man|garçon|boy/i;
  const hasGenderSpecified = genderKeywords.test(subject);

  return !hasGenderSpecified && isPersonRequested
    ? `HUMAN MODEL CASTING SYSTEM

CASTING SEED: ${castingSeed}

The system must cast a completely different human model for this image.

Model selection rules:
- random gender
- random ethnicity
- random facial structure
- random hairstyle
- random body type

Possible examples:
- asian female creative
- athletic black male architect
- latina female designer
- european male photographer
- middle eastern female artist
- mixed ethnicity male illustrator

Select ONE randomly based on the casting seed.

Age rules:
- 18 to 50 years old only
- young adult to middle-aged
- NO elderly
- NO old faces

The generated person must look like a real unique individual.

Never reuse the same face across generations.

The identity of the person must be completely different each time this prompt is executed.
`
    : '';
}

/**
 * 🎨 BUILD MATTE PRODUCT PROMPT FOR DALL-E
 * Modern minimalist advertising poster with matte gradient background
 */
private buildMatteProductPrompt(
  subject: string = 'modern product',
  titre: string = '',
  sousTitre: string = '',
  colorPrincipale: string = '#1A1A2E',
  colorSecondaire: string = '#FFFFFF',
): string {
  const finalPrompt = `Create a premium cinematic editorial advertising poster.

FORMAT

Vertical poster layout.
Minimal modern advertising design.

COMPOSITION

Place the subject in the LOWER THIRD of the frame.

Use a medium portrait framing (chest up).

The subject should appear large and dominant.

Position the subject slightly LEFT of center.

Leave large negative space above the subject for typography.

PHOTOGRAPHY STYLE

Cinematic editorial studio photography.

Lighting style:

low key lighting  
dramatic shadows  
soft directional side light  
high contrast  
moody atmosphere  

The subject should be partially in shadow.

BACKGROUND

Use a deep black background.

Add a colored light glow behind the subject.

Primary color:
black

Secondary color:
${colorSecondaire}

The colored light must come from the RIGHT side behind the subject.

Create a strong vignette around the edges.

Edges must fade into deep black.

GRAPHIC ELEMENTS

Add minimal UI design elements:

two very small thin white crosses near the top corners.

TYPOGRAPHY

Main title:

${titre}

Style:

EXTRA BOLD  
ALL CAPS  
condensed sans-serif  
Druk / Bebas Neue style  

The title must be EXTREMELY LARGE.

The title should dominate the upper half of the poster.

GRAPHIC DIVIDER

Below the title add a thin horizontal line on both sides.

Place a medium white dot exactly in the center between the lines.

Example structure:

-----   ●   -----

SLOGAN

Below the divider display:

${sousTitre}

Style:

small  
modern minimalist sans-serif  
centered  
subtle spacing

MOOD

dark cinematic poster  
editorial advertising photography  
luxury brand aesthetic`;

  return finalPrompt;
}

/**
 * 🎨 BUILD NEON EDITORIAL PROMPT FOR DALL-E
 * Modern editorial poster with strong cinematic contrast and futuristic elements
 */
private buildNeonEditorialPrompt(
  subject: string = 'modern subject',
  titre: string = '',
  sousTitre: string = '',
  colorSecondaire: string = '#00FF88',
): string {
  const finalPrompt = `Create a modern editorial poster with a strong cinematic contrast.

SUBJECT

If an image is uploaded:
Use the uploaded image as the main subject.

If no image is uploaded:
Generate a realistic professional portrait based on this description:

${subject}

STYLE

High contrast portrait photography.

The subject should appear mostly dark, almost black silhouette,
with subtle light edges.

BACKGROUND

Use a vibrant glowing gradient background color:

${colorSecondaire}

The background should feel luminous and atmospheric.

GRAPHIC DESIGN

Add subtle futuristic UI elements:

* thin white graphic lines
* micro typography
* minimal tech interface elements
* abstract geometric overlays

BACKGROUND TITLE

Use the TITLE as a very large word behind the subject.

Text:
${titre}

Style:
* very large typography
* bold
* partially hidden behind the subject
* opacity around 20–30%

FOREGROUND TEXT

Display the subtitle as a small slogan in front.

Text:
${sousTitre}

Style:
* clean modern typography
* white text
* centered or slightly above the lower third
* minimal and elegant

MOOD

Editorial poster  
Modern startup visual  
High contrast  
Premium digital design  
Futuristic and minimal`;

  return finalPrompt;
}

/**
 * 🎨 BUILD EPIC BRAND PROMPT FOR DALL-E
 * Cinematic promotional poster with double-exposure composition
 */
private buildEpicBrandPrompt(
  subject: string = 'modern subject',
  titre: string = '',
  sousTitre: string = '',
  colorSecondaire: string = '#FF9800',
): string {
  const finalPrompt = `Create a cinematic promotional poster with a powerful double-exposure composition.

INPUT TYPE RULES:

If an image is provided by the user:
- Use the uploaded image as the MAIN SUBJECT.
- Do NOT generate a new person or subject.
- Keep the exact face, pose, and identity from the uploaded image.
- Apply the design and effects around this image only.

If NO image is provided:
- Generate a realistic professional image based on the subject description.

SUBJECT:
${subject}

STYLE:
Modern cinematic poster inspired by movie key art and premium advertising visuals.

COMPOSITION:
- Vertical poster layout
- Main subject placed in the foreground
- Behind the subject create a large semi-transparent portrait of the same subject
- This creates a double exposure cinematic effect
- The background must remain partially white or very light for a clean premium look

COLOR RULES:
- The image should be mostly black and white
- Only ONE strong accent color is used: ${colorSecondaire}
- Apply this color as dramatic lighting, glow, or gradient overlay
- High contrast cinematic lighting

TEXT LAYOUT:
Add bold modern typography.

Main title:
${titre}

Subtitle:
${sousTitre}

Do NOT add any additional text.

DESIGN STYLE:
- Premium advertising poster
- Ultra realistic photography
- Cinematic lighting
- Strong contrast
- Modern clean composition`;

  return finalPrompt;
}

/**
 * 🎨 BUILD PROFESSION ICON PROMPT FOR DALL-E
 * Editorial magazine poster inspired by professional magazine covers
 */
private buildProfessionIconPrompt(
  subject: string = 'professional',
  titre: string = '',
  sousTitre: string = '',
  isPersonRequested: boolean = false,
): string {
  const mannequinVariation = this.getMannequinVariationDirective(subject, isPersonRequested);
  
  const finalPrompt = `Create a minimalist editorial poster inspired by magazine covers.

SUBJECT

If an image is uploaded:
Use the uploaded image as the main subject.

If no image is uploaded:
Generate a realistic professional scene based on:

${subject}

${mannequinVariation}

STYLE

Black and white photography.

High contrast editorial portrait.

The subject must appear professional and iconic.

COMPOSITION

The subject must be centered in the lower half of the image.

Add objects related to the profession around the subject.

Example:
* bread and flour for a baker
* house model for a real estate agent
* tattoo machine for a tattoo artist

BACKGROUND

Minimal light background.

Clean and spacious composition with lots of empty space.

TEXT LAYOUT

Horizontal title at the top:

${titre}

Vertical profession text on the side:

${sousTitre}

Typography must be bold, modern and editorial.

MOOD

Editorial magazine poster
Professional
Minimal
Iconic
Documentary photography style`;

  return finalPrompt;
}

/**
 * 🎨 BUILD MONO ACCENT PROMPT FOR DALL-E
 * Minimalist B&W layout with a single color accent.
 */
private buildMonoAccentPrompt(
  subject: string = 'modern subject',
  titre: string = '',
  sousTitre: string = '',
  colorPrincipale: string = '#000000',
  colorSecondaire: string = '#FFFFFF',
  isPersonRequested: boolean = false,
): string {

  const mannequinVariation = this.getMannequinVariationDirective(subject, isPersonRequested);

const finalPrompt = `Create a minimalist editorial advertising poster.

Scene:
A construction worker kneeling and laying bricks with a trowel.

Lighting:
Strong directional lighting from the top left creating natural shadows on the subject.
High contrast on the worker, soft contrast on the background.

Color style:
Selective color effect.
The entire image is black and white except one fluorescent neon accent color: ${colorSecondaire}.

The accent color must be extremely saturated and vibrant, almost glowing.

Apply the accent color to:
- clothing
- tools
- work materials

Everything else must remain grayscale.

${mannequinVariation}

Background:
Bright white concrete wall with subtle texture and small grey imperfections.
The background must be bright, slightly dirty, and textured but not dark.

Composition:
The subject is placed in the lower half of the image.
Large empty space above the subject for the text.

Typography:
Bold modern sans-serif font.
All text must be horizontal.

Top title (very large and bold):
${titre}

No line under the title.
No decorative stroke.

Subtitle below:
${sousTitre}

Style reference:
Industrial advertising photography, documentary realism, high contrast subject, bright textured background.

Output:
Professional poster style, high resolution, cinematic lighting.
fluorescent workwear color grading`;

return finalPrompt;
}

  /**
   * 🎨 BUILD MAGAZINE-STYLE ELITE PROMPT FOR DALL-E
   * Génère un prompt ultra-affiné pour produire des rendus Vogue/Numéro/Fashion
   * Utilise les règles de l'architecture + directives cinématographiques
   */
  private buildMagazineStylePrompt(
    modelName: string,
    architecture: any,
    job: string,
    userQuery: string,
    brandingColor?: string,
    customSubject: string = '',
    isPersonRequested: boolean = false,
  ): string {
    if (modelName?.toUpperCase() === 'EDITORIAL MOTION') {
      return this.buildEditorialMotionPrompt(
        architecture,
        job,
        userQuery,
        '', // mainWord
        '', // scriptPhrase
        '', // infoLine
        '', // textPromo
        brandingColor,
        '#FFFFFF',
        customSubject,
        isPersonRequested,
      );
    }

    const selectedPosture =
      customSubject && !isPersonRequested
        ? 'POSTURE & PLACEMENT: Place the subject perfectly in the frame, highlighting its finest details and ensuring an editorial standard.'
        : 'EXACT 1:1 POSTURE FROM REFERENCE: Subtle 3/4 profile view. The back/shoulders are positioned slightly to the RIGHT, but the body is turned mostly TOWARDS THE FRONT. ZERO TILT: The subject must have NO inclination to the left or right. PERFECT VERTICAL ALIGNMENT: The spine and head must be perfectly vertical, matching the original photo exactly. Natural, upright head and IDENTICAL GAZE FROM REFERENCE: Precise, serious gaze directed straight and vertical, following the original head position.';
    // Map model types to photography styles (referenced from example flyers)
    const fashionModels = ['FASHION', 'STYLE', 'VOGUE', 'COLLECTION', 'MODE'];
    const luxuryModels = ['LUXURY', 'PREMIUM', 'CLASSIQUE', 'ELEGANT'];
    const sportsModels = ['NIKE', 'ADIDAS', 'SPORTS', 'FASHION_SHOW'];
    const businessModels = ['CORPORATE', 'NUMERO', 'HOMME', 'MAGAZINE'];

    const isFashion = fashionModels.some((m) =>
      modelName?.toUpperCase().includes(m),
    );
    const isLuxury = luxuryModels.some((m) =>
      modelName?.toUpperCase().includes(m),
    );
    const isSports = sportsModels.some((m) =>
      modelName?.toUpperCase().includes(m),
    );
    const isBusiness = businessModels.some((m) =>
      modelName?.toUpperCase().includes(m),
    );

    // CINEMATOGRAPHY & COMPOSITION RULES (from example flyers analysis)
    const cinematicDirectives = isFashion
      ? `CINEMATOGRAPHY: Ultra-wide depth of field (f/1.8 equivalent), minimal background blur, editorial fashion lighting. 
         POSTURE: ${selectedPosture}
         ATMOSPHERE: MOODY_GRADIENT, intensity: MEDIUM_DARK, OPAQUE and SOLID. 
         BORDER AESTHETIC: NOIR SOMBRE AUTOUR (DEEP BLACK VIGNETTE). The perimeter and corners are solid deep black.
         GRADIENT DIRECTION: TOP_RIGHT_TO_BOTTOM_LEFT, with ${brandingColor || 'Primary Color'} dominant on the LEFT side.
         BACKGROUND TRANSITION: Deep black borders to ${brandingColor || 'vibrant accent'} to a soft, OPAQUE white glow.
         PROHIBITIONS: NO ["motion_blur", "speed_trails", "busy_patterns"]${customSubject && !isPersonRequested ? ', NO humans, NO people, NO mannequins' : ''}.
         COMPOSITION: Subject positioned off-center following rule of thirds, dynamic diagonal flow, negative space breathing.\nREFERENCES: Vogue USA, Harper's Bazaar.`
      : isLuxury
        ? `CINEMATOGRAPHY: Studio-controlled volumetric lights, high contrast dramatic lighting. 
           POSTURE: ${selectedPosture}
           ATMOSPHERE: MOODY_GRADIENT, intensity: MEDIUM_DARK, Premium OPAQUE depth. 
           BORDER AESTHETIC: NOIR SOMBRE AUTOUR (DEEP BLACK VIGNETTE). The perimeter and corners are solid deep black.
           GRADIENT DIRECTION: TOP_RIGHT_TO_BOTTOM_LEFT, with ${brandingColor || 'Luxurious Color'} dominant on the LEFT.
           BACKGROUND TRANSITION: Deep black borders to obsidian dark to ${brandingColor || 'luxurious color'} to a subtle, OPAQUE white backlight.
           PROHIBITIONS: NO ["motion_blur", "speed_trails", "busy_patterns"]${customSubject && !isPersonRequested ? ', NO humans, NO people, NO mannequins' : ''}.
           COMPOSITION: Center-weighted symmetry, minimal negative space, maximum focus on detail quality.`
        : isBusiness
          ? `CINEMATOGRAPHY: Professional headshot lighting, sharp focus. 
             POSTURE: ${selectedPosture}
             ATMOSPHERE: MOODY_GRADIENT, OPAQUE professional depth.
             BORDER AESTHETIC: NOIR SOMBRE AUTOUR (DEEP BLACK VIGNETTE). The perimeter and corners are solid deep black.
             GRADIENT DIRECTION: TOP_RIGHT_TO_BOTTOM_LEFT, with ${brandingColor || 'Corporate Color'} on the LEFT.
             BACKGROUND TRANSITION: Deep black borders to dark grey to ${brandingColor || 'corporate color'} to opaque white/light grey.
             PROHIBITIONS: NO ["motion_blur", "speed_trails", "busy_patterns"]${customSubject && !isPersonRequested ? ', NO humans, NO people, NO mannequins' : ''}.
             COMPOSITION: Confident centered presence, strategic negative space, typography-integrated layout.`
          : `CINEMATOGRAPHY: Professional studio lighting, sharp focus, cinematic depth. 
             POSTURE: ${selectedPosture}
             ATMOSPHERE: MOODY_GRADIENT, OPAQUE atmospheric transition.
             BORDER AESTHETIC: NOIR SOMBRE AUTOUR (DEEP BLACK VIGNETTE). The perimeter and corners are solid deep black.
             GRADIENT DIRECTION: TOP_RIGHT_TO_BOTTOM_LEFT, with ${brandingColor || 'Primary Color'} on the LEFT.
             BACKGROUND TRANSITION: Deep black borders to ${brandingColor || 'primary color'} to opaque white glow.
             PROHIBITIONS: NO ["motion_blur", "speed_trails", "busy_patterns"]${customSubject && !isPersonRequested ? ', NO humans, NO people, NO mannequins' : ''}.
             COMPOSITION: Subject positioned slightly to the RIGHT in a professional pose. Face/head must remain natural and upright. Strategic negative space, typography-integrated layout.`;

    // ARCHITECTURE-BASED RULES
    const architectureRules = architecture
      ? `
ARCHITECTURE DIRECTIVES FROM MODEL '${modelName}':
- Subject Positioning: ${architecture.rules.subject}
- Background Treatment: ${architecture.rules.background}
- Typography Style: ${architecture.rules.title}
- Additional Elements: ${architecture.rules.constraints}`
      : '';

    // TYPOGRAPHY MASTER - MANDATORY TEXT RENDERING
    const typographyMastery = `TYPOGRAPHY & TEXT RENDERING (MANDATORY):
- YOU MUST RENDER THE FOLLOWING TEXT DIRECTLY ON THE IMAGE:
  1. MAIN TITLE: "${(userQuery || modelName).toUpperCase()}"
  2. SUPPORTING TEXT: "${job}"
- Style for ${isFashion ? 'Fashion' : isLuxury ? 'Luxury' : 'Business'}:
  ${isFashion ? 'ULTRA-BOLD and MASSIVE SCALE high-impact sans-serif (use "Anton", "Bebas Neue", or "Impact"). MUST BE EXTREMELY BIG AND DOMINANT. NO tilted text, strictly vertical on left. ABSOLUTE PREMIER PLAN (FOREGROUND): The text must overlay/overlap the subject.' : isLuxury ? 'Fine serif or modern sans, elegant and refined. Centered or perfectly justified. ABSOLUTE PREMIER PLAN (FOREGROUND): The text must be in the absolute foreground, over the subject.' : 'Professional ULTRA-BOLD and MASSIVE sans-serif (Anton/Bebas Neue style), extremely thick and thick. ABSOLUTE PREMIER PLAN (FOREGROUND): Clear text overlay on top of everything.'}
- Color: ${brandingColor || 'High contrast against background'}.
- ALL TEXT MUST BE LEGIBLE, 100% OPAQUE (strictly NO transparency), and INTEGRATED INTO THE DESIGN WITHOUT ANY BACKGROUND BOXES, FRAMES OR CONTAINERS.
- TYPOGRAPHY MANDATE: main title must be REALLY BIG, ULTRA-BOLD, and MASSIVE. High design sophistication. Absolute premier plan focus.`;

    // SUBJECT DESCRIPTION ENHANCEMENT (from user job or custom)
    const subjectEnhancer = (() => {
      if (customSubject && !isPersonRequested) {
        return `SUBJECT: ${customSubject}, professional editorial lighting, cinematic presence, high-quality focus`;
      } else if (customSubject && isPersonRequested) {
        return `SUBJECT: ${customSubject}, featuring a professional person/model matching the description, diverse ethnicity, 25-45 years old, sleek styling, sharp professional presence`;
      }
      const jobLower = job?.toLowerCase() || '';
      if (jobLower.includes('femme') || jobLower.includes('woman'))
        return 'SUBJECT: Confident professional woman, diverse ethnicity, 25-45 years old, sleek styling, direct gaze, sharp professional presence';
      if (jobLower.includes('homme') || jobLower.includes('man'))
        return 'SUBJECT: Confident professional man, diverse ethnicity, 25-45 years old, sharp tailoring, composed presence, executive confidence';
      if (jobLower.includes('fashion') || jobLower.includes('mode'))
        return `SUBJECT: High-fashion model in elevated clothing, perfect posture, editorial presence, authentic emotion, ${brandingColor ? `color-coordinated with ${brandingColor}` : 'color harmony'}`;
      if (jobLower.includes('produit') || jobLower.includes('product'))
        return 'SUBJECT: Hero product photography, centered, pristine condition, expertly styled, luxury presentation, shadow definition';
      return `SUBJECT: Professional subject for ${job}, editorial quality, authentic lighting, confident presence, 4K clarity`;
    })();

    // QUALITY & TECHNICAL SPECIFICATIONS (reference magazine standards)
    const technicalSpecs = `TECHNICAL QUALITY:
- Resolution: 4K minimum (1024x1536 base, upscaled to 8K conceptually)
- Photography: Hyperrealistic photographic rendering, NOT illustration
- Lighting: Professional studio-grade or natural window light, physically plausible
- Color Grading: Sophisticated color grading with reference to luxury lifestyle magazines
- Details: Sharp textures, realistic fabric, authentic materials, skin tone perfection
- COLOR PERFORMANCE: Rich, vibrant, editorial-grade color. ABSOLUTELY NO BLACK AND WHITE.
- NO AI ARTIFACTS: No plastic reflections, no impossible physics, no synthetic glows`;

    // WHAT TO AVOID (critical)
    const prohibitions =
      customSubject && !isPersonRequested
        ? `PROHIBITIONS - STRICTLY AVOID:
- NO humans, NO people, NO fashion models, NO mannequins. Focus ONLY on the object/subject.
- NO cheap plastic surfaces or CGI-obvious elements.
- NO poorly-rendered hands, distorted proportions, or anatomy errors.
- NO generic stock photo backgrounds.
- NO AI hallucinations (extra fingers, morphed faces, etc.).
- NO watermarks, copyright marks, or ai signatures.
- NO dramatic lighting that looks impossible.
- NO BLACK AND WHITE, NO GRAYSCALE, NO MONOCHROME RENDERING.
- NO colors that don't exist in real materials.`
        : `PROHIBITIONS - STRICTLY AVOID:
- NO cheap plastic surfaces or CGI-obvious elements.
- NO poorly-rendered hands, distorted proportions, or anatomy errors.
- NO generic stock photo backgrounds.
- NO AI hallucinations (extra fingers, morphed faces, etc.).
- NO watermarks, copyright marks, or ai signatures.
- NO dramatic lighting that looks impossible.
- NO BLACK AND WHITE, NO GRAYSCALE, NO MONOCHROME RENDERING.
- NO colors that don't exist in real materials.`;

    // FINAL INTEGRATED PROMPT
    const finalPrompt = `${subjectEnhancer}

${cinematicDirectives}

${typographyMastery}

${architectureRules}

CONTEXT & BRAND: Model="${modelName}", Job="${job}", User intent: "${userQuery || 'professional flyer'}"
${brandingColor ? `Brand accent color: ${brandingColor}` : ''}

${technicalSpecs}

${prohibitions}

MANDATE: Create a VOGUE/NUMÉRO magazine editorial-quality flyer that would ACTUALLY be published. Maximum professional sophistication. ZERO compromise on authenticity.`;

    this.logger.log(
      `[buildMagazineStylePrompt] Generated elite prompt for model: ${modelName}`,
    );
    return finalPrompt;
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
        ? `Include ONLY the exact text explicitly requested: "${params.userQuery}". No other text, logo or watermark. NO OpenAI logo.`
        : 'NO text,NO watermark,NO logo,NO letters,NO numbers,NO words,NO captions,NO overlays,NO unsolicited branding,NO OpenAI logo';
    })();
    const finalPrompt = `STYLE: ${styleName}. ${promptBody}. Detailed requirements: ${params.userQuery || ''} QUALITY: ${realismTriggers} ${qualityTags}. RULES: ${noTextRulePipeline} NO OpenAI branding.`;

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
      logoUrl?: string;
      noLogo?: boolean;
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

      return `EXTREME CLARITY. Authentic photography. SHARP FOCUS on subject. Cleanest possible composition. ${lighting}, ${angle}, realistic skin textures. ${bgDirectives} ${professionalContext} RULES: SHARP AND DISTINCT. NO synthetic objects, NO ai-generated banners, NO floating graphics. PURE PHOTOGRAPHY. All objects must be real, physical, and tangible. Single natural subject. COLOR: Natural colors with a ${accent} accent. High-end candid style. ZERO ai-artifacts, ZERO fake signage, ZERO digital banners, NO OpenAI logo, NO OpenAI branding, NO watermarks. Ensure everything looks like a real-world photograph.`
        .replace(/\s+/g, ' ')
        .trim();
    }

    if (styleName === 'Hero Studio') {
      return `Extreme minimalist portrait. Solid empty background, natural soft lighting. Focus ONLY on the person. NO objects, NO busy background. Clear and breathable.`;
    }
    if (styleName === 'Minimal Studio') {
      return `Minimalist to the maximum. Solid neutral background, huge negative space, soft daylight. The subject is the only focal point. Elegantly empty.`;
    }

    if (styleName === 'Modern Typo') {
      return this.getModelDescription(
        'Moderne typographie bold',
        jobStr,
        options,
      );
    }
    if (styleName === 'Modern Neon') {
      return this.getModelDescription('Moderne néon', jobStr, options);
    }
    if (styleName === 'Modern Gradient') {
      return this.getModelDescription(
        'Moderne dégradé (gradient)',
        jobStr,
        options,
      );
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
      } else {
        specificDirectives =
          'Experimental grid-work, bold use of white space, and innovative graphic architecture.';
      }
    }

    const architecture =
      VISUAL_ARCHITECTURES[model.toLowerCase()] ||
      VISUAL_ARCHITECTURES['minimal studio'];

    let upperZoneRule = `UPPER: Empty. Fixed 10% top margin.`; // Default to empty
    if (options?.noLogo === true) {
      upperZoneRule = `UPPER: Empty. Fixed 10% top margin.`;
    } else if (options?.logoUrl) {
      upperZoneRule = `UPPER: Clear professional BRAND LOGO from user profile. Placed centered in upper margin. High-end visibility.`;
    } else {
      // If no logo provided, we strictly want Empty, even if architecture says otherwise
      upperZoneRule = `UPPER: Empty. Fixed 10% top margin.`;
    }

    const architectureInstructions = `
COMPOSITION ARCHITECTURE:
- ${architecture.rules.subject}
- ${architecture.rules.background}
- ${architecture.rules.title}
- ${architecture.rules.subtitle}
- ${architecture.rules.infoBlock}
- ${upperZoneRule}
- ${architecture.rules.constraints}
`.trim();

    const logoDirectives =
      options?.noLogo === true ? 'NO logo. NO watermark.' : '';

    return `Mood: ${mood}. Layout Priority: ${layout}. Structural Elements: ${structure}. Specific Visuals: ${specificDirectives}. Job Context: ${jobStr}. ${lighting}. ${bg}. Accent Color: ${accent}. EXTREME CLARITY. Authentic photography style. SHARP FOCUS. ${architectureInstructions} ${logoDirectives} RULES: NO OpenAI logo, NO OpenAI branding, NO watermarks. All objects must be real, physical, and tangible. Professional graphic design overlays and banners are ENCOURAGED for text readability. High-end production value. Zero AI artifacts. Everything must look like a high-budget professional production for a "${model}" flyer.`
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
      const startTime = Date.now();
      const containsArchitecture =
        prompt.includes('COMPOSITION ARCHITECTURE') || prompt.includes('FLYER');
      const textConstraint = containsArchitecture
        ? 'NO watermark, NO unsolicited branding, NO OpenAI logo, NO OpenAI branding'
        : 'NO text, NO watermark, NO logo, NO letters, NO numbers, NO words, NO captions, NO overlays, NO unsolicited branding, NO OpenAI logo, NO OpenAI branding';

      const realismEnhancedPrompt =
        `${prompt} REALISM:Hyper-realistic-photo,natural-skin-texture,visible-pores,correct-anatomy,natural-light. ${textConstraint}`
          .replace(/\s+/g, ' ')
          .trim();

      this.logger.log(
        `[callOpenAiToolImage] Generating with gpt-image-1.5. Prompt Length: ${realismEnhancedPrompt.length}. Size: ${options?.size || '1024x1024'}`,
      );

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
      if (error.response?.data) {
        // Axios error response might be a stream if responseType was 'stream'
        if (error.response.data.on) {
          try {
            const errorBody = await new Promise((resolve) => {
              let body = '';
              error.response.data.on('data', (chunk) => {
                body += chunk;
              });
              error.response.data.on('end', () => resolve(body));
            });
            this.logger.error(
              `[callOpenAiToolImage] 400 Error Body: ${errorBody}`,
            );
          } catch (e) {
            this.logger.error(
              `[callOpenAiToolImage] Could not parse error stream: ${e.message}`,
            );
          }
        } else {
          this.logger.error(
            `[callOpenAiToolImage] Error Data: ${JSON.stringify(error.response.data)}`,
          );
        }
      }
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

  private async processOpenAiToolImageBackground(
    generationId: number,
    params: any,
    userId: number,
    styleName: string,
    imageBuffer?: Buffer,
  ) {
    this.logger.log(
      `[processOpenAiToolImageBackground] START for Gen: ${generationId}. (Background Refinement active)`,
    );

    try {
      const startTime = Date.now();

      // 1. Fetch user branding info
      const user = await this.getAiUserWithProfile(userId);
      const brandingColor = user?.brandingColor || null;
      let logoUrl = user?.logoUrl || null;

      // Check for logo suppression (keyword detection or explicit flag)
      const userQueryLower = (params.userQuery || '').toLowerCase();
      const jobLower = (params.job || '').toLowerCase();
      const noLogoKeywords = [
        'sans logo',
        'pas de logo',
        'no logo',
        'no-logo',
        'supprimer le logo',
        'enlever le logo',
      ];
      const hasNoLogoRequest =
        params.noLogo === true ||
        noLogoKeywords.some(
          (kw) => userQueryLower.includes(kw) || jobLower.includes(kw),
        );

      if (hasNoLogoRequest) {
        this.logger.log(
          `[processOpenAiToolImageBackground] Logo suppression detected for Gen: ${generationId}`,
        );
        logoUrl = null;
      }

      // 2. Refine the query for visual richness
      const refinedRes = await this.refineQuery(
        params.userQuery || params.job,
        params.job,
        styleName,
        params.language || 'French',
        brandingColor,
      );

      // 3. Get style description
      const baseStylePrompt = this.getStyleDescription(styleName, params.job, {
        accentColor: brandingColor || refinedRes.accentColor,
        lighting: refinedRes.lighting,
        angle: refinedRes.angle,
        background: refinedRes.background,
        primaryObject: refinedRes.primaryObject,
        logoUrl,
        noLogo: hasNoLogoRequest,
      });

      // 4. Refine subject if job is present
      let refinedSubject = '';
      if (params.job && params.job.length > 0) {
        refinedSubject = await this.refineSubject(params.job);
      }

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
          refinedRes.prompt.toLowerCase().includes(kw) ||
          (params.userQuery || '').toLowerCase().includes(kw) ||
          (params.job || '').toLowerCase().includes(kw),
      );

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

      const promptBody = refinedRes.prompt
        ? `${refinedRes.prompt}. Aesthetic: ${baseStylePrompt}.`
        : baseStylePrompt;

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
      ].some((kw) => (params.userQuery || '').toLowerCase().includes(kw));

      let cleanedUserQuery = params.userQuery || '';
      if (hasNoLogoRequest) {
        noLogoKeywords.forEach((kw) => {
          cleanedUserQuery = cleanedUserQuery.replace(new RegExp(kw, 'gi'), '');
        });
        cleanedUserQuery = cleanedUserQuery.trim().replace(/^(et|and)\s+/i, '');
      }

      const noTextRule = userExplicitlyRequestsText
        ? `IMPORTANT: Include ONLY the exact text explicitly requested: "${cleanedUserQuery}". No other text, logo or watermark. NO OpenAI logo.`
        : 'NO text,NO watermark,NO logo,NO letters,NO numbers,NO words,NO captions,NO overlays,NO unsolicited branding,NO OpenAI logo';

      const finalPrompt = `STYLE: ${styleName}. ${promptBody}. Detailed requirements: ${cleanedUserQuery || ''} QUALITY: ${realismTriggers} ${qualityTags}. RULES: ${noTextRule} NO OpenAI branding.`;

      let finalBuffer: Buffer;
      if (imageBuffer) {
        this.logger.log(
          `[processOpenAiToolImageBackground] Strategy: OpenAI Image Edit`,
        );
        finalBuffer = await this.callOpenAiImageEdit(imageBuffer, finalPrompt, {
          quality: 'medium',
          skipRefinement: true,
        });
      } else {
        this.logger.log(
          `[processOpenAiToolImageBackground] Strategy: Text-to-Image`,
        );
        finalBuffer = await this.callOpenAiToolImage(finalPrompt, {
          quality: 'medium',
        });
      }

      const fileName = `gen_final_${generationId}_${Date.now()}.jpg`;
      const uploadPath = '/home/ubuntu/uploads/ai-generations';

      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }

      const filePath = path.join(uploadPath, fileName);
      fs.writeFileSync(filePath, finalBuffer);

      const imageUrl = `https://hipster-api.fr/uploads/ai-generations/${fileName}`;

      await this.aiGenRepo.update(generationId, {
        imageUrl,
        result: imageBuffer ? 'OPENAI_IMAGE_EDIT' : 'OPENAI_TOOL_TEXT_TO_IMAGE',
        attributes: {
          style: styleName,
          async: true,
          completedAt: new Date().toISOString(),
          refinementDuration:
            ((Date.now() - startTime) / 1000).toFixed(1) + 's',
          prompt: finalPrompt,
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

  /* --------------------- BACKGROUND FLYER PROCESSOR --------------------- */
  private async processFlyerBackground(
    generationId: number,
    params: any,
    userId: number,
    model: string,
    imageBuffer?: Buffer,
  ) {
    this.logger.log(
      `[processFlyerBackground] START for Gen: ${generationId}. Model: ${model}. (Background Refinement with 78-Architecture system)`,
    );

    try {
      const startTime = Date.now();

      // 1. Fetch user branding info
      const user = await this.getAiUserWithProfile(userId);
      const brandingColor = user?.brandingColor || null;
      let logoUrl = user?.logoUrl || null;

      // Check for logo suppression (keyword detection or explicit flag)
      const userQueryLower = (params.userQuery || '').toLowerCase();
      const jobLower = (params.job || '').toLowerCase();
      const noLogoKeywords = [
        'sans logo',
        'pas de logo',
        'no logo',
        'no-logo',
        'supprimer le logo',
        'enlever le logo',
      ];
      const hasNoLogoRequest =
        params.noLogo === true ||
        noLogoKeywords.some(
          (kw) => userQueryLower.includes(kw) || jobLower.includes(kw),
        );

      if (hasNoLogoRequest) {
        this.logger.log(
          `[processFlyerBackground] Logo suppression detected for Gen: ${generationId}`,
        );
        logoUrl = null;
      }

      let cleanedUserQuery = params.userQuery || '';
      if (hasNoLogoRequest) {
        noLogoKeywords.forEach((kw) => {
          cleanedUserQuery = cleanedUserQuery.replace(new RegExp(kw, 'gi'), '');
        });
        cleanedUserQuery = cleanedUserQuery.trim().replace(/^(et|and)\s+/i, '');
      }

      const flyerLanguage = params.language || 'French';

      // 2. RETRIEVE 78-ARCHITECTURE FOR THIS MODEL
      const architecture = getVisualArchitecture(model);
      let magazineStyleDirective: string;

      if (architecture) {
        this.logger.log(
          `[processFlyerBackground] Retrieved architecture for model: ${model} (Layout: ${architecture.layoutType})`,
        );

        // Unify parameter extraction for all 78-architectures
        const mainWord =
          params.mainWord || params.modelName || model || 'HIPSTER';
        const scriptPhrase =
          params.scriptPhrase || params.subtitle || 'Save the Date';
        const infoLine =
          params.infoLine || params.infoBlock || 'RDV • Adresse • Téléphone';
        const colorPrincipale =
          params.colorPrincipale || brandingColor || '#17A2B8';
        const colorSecondaire = params.colorSecondaire || '#FFFFFF';
        const textPromo = params.textPromo || '';
        const customSubject = params.subject || '';

        // Detect if the custom subject explicitly asks for a person
        const isPersonRequested = customSubject
          ? !!customSubject.match(
              /personne|femme|homme|mannequin|fille|garçon|modèle|model|man|woman|girl|boy|person/i,
            )
          : false;

        if (architecture.layoutType === 'TYPE_FASHION_VERTICAL') {
          this.logger.log(
            `[processFlyerBackground] Building FASHION_VERTICAL_IMPACT prompt: mainWord="${mainWord}", colorPrincipale="${colorPrincipale}", colorSecondaire="${colorSecondaire}"`,
          );

          magazineStyleDirective = this.buildFashionVerticalPrompt(
            architecture,
            params.job,
            params.userQuery || '',
            mainWord,
            scriptPhrase,
            infoLine,
            colorPrincipale,
            colorSecondaire,
            customSubject,
            isPersonRequested,
          );
        } else if (architecture.layoutType === 'TYPE_EDITORIAL_COVER') {
          this.logger.log(
            `[processFlyerBackground] Building EDITORIAL_COVER prompt (monochromatic): color="${colorPrincipale}"`,
          );

          magazineStyleDirective = this.buildEditorialCoverPrompt(
            architecture,
            params.job,
            params.userQuery || '',
            mainWord,
            scriptPhrase,
            infoLine,
            colorPrincipale,
            colorSecondaire,
            customSubject,
            isPersonRequested,
          );
        } else if (architecture.layoutType === 'TYPE_IMPACT_COMMERCIAL') {
          this.logger.log(
            `[processFlyerBackground] Building IMPACT_COMMERCIAL prompt: color="${colorPrincipale}", textPromo="${textPromo}"`,
          );

          magazineStyleDirective = this.buildImpactCommercialPrompt(
            architecture,
            params.job,
            params.userQuery || '',
            mainWord,
            scriptPhrase,
            infoLine,
            textPromo,
            colorPrincipale,
            colorSecondaire,
            customSubject,
            isPersonRequested,
          );
        } else if (architecture.layoutType === 'TYPE_PRESTIGE_BW') {
          this.logger.log(
            `[processFlyerBackground] Building PRESTIGE_BW prompt: mainWord="${mainWord}"`,
          );

          magazineStyleDirective = this.buildPrestigeBWPosterPrompt(
            customSubject || params.job || 'A luxury object',
            mainWord,
          );
        } else if (architecture.layoutType === 'TYPE_EDITORIAL') {
          this.logger.log(
            `[processFlyerBackground] Building EDITORIAL_MOTION prompt: color="${colorPrincipale}", textPromo="${textPromo}"`,
          );

          magazineStyleDirective = this.buildEditorialMotionPrompt(
            architecture,
            params.job,
            params.userQuery || '',
            mainWord,
            scriptPhrase,
            infoLine,
            textPromo,
            colorPrincipale,
            colorSecondaire,
            customSubject,
            isPersonRequested,
          );
        } else if (architecture.layoutType === 'TYPE_SIGNATURE_SPLASH') {
          this.logger.log(
            `[processFlyerBackground] Building SIGNATURE_SPLASH prompt: subject="${customSubject || params.job}", titleText="${mainWord}"`,
          );

          magazineStyleDirective = this.buildSignatureSplashPrompt(
            customSubject || params.job || 'A premium subject',
            mainWord,
            scriptPhrase,
          );
        } else if (architecture.layoutType === 'TYPE_DIAGONAL_SPLIT_DESIGN') {
          this.logger.log(
            `[processFlyerBackground] Building DIAGONAL_SPLIT_DESIGN prompt: subject="${customSubject || params.job}", titleText="${mainWord}"`,
          );
          magazineStyleDirective = this.buildDiagonalSplitDesignPrompt(
            customSubject || params.job || 'A premium subject',
            params.mainWord || params.modelName || model || 'NEW EPISODE',
            params.scriptPhrase || params.subtitle || '',
            params.infoLine || params.infoBlock || '',
            colorPrincipale,
            colorSecondaire,
            user?.name || '',
          );
        } else if (architecture.layoutType === 'TYPE_STUDIO_POSTER') {
          this.logger.log(
            `[processFlyerBackground] Building STUDIO_POSTER prompt: subject="${customSubject || params.job}", titleText="${mainWord}"`,
          );
          magazineStyleDirective = this.buildStudioPosterPrompt(
            customSubject || params.job || 'A premium subject',
            params.mainWord || params.modelName || model || '',
            params.scriptPhrase || params.subtitle || '',
            colorPrincipale,
            colorSecondaire,
          );
        } else if (
          model.toLowerCase().includes('diagonal split design') ||
          model.toLowerCase().includes('diagonal-split-design')
        ) {
          this.logger.log(
            `[processFlyerBackground] Building DIAGONAL_SPLIT_DESIGN prompt: subject="${customSubject || params.job}", titleText="${mainWord}"`,
          );
          magazineStyleDirective = this.buildDiagonalSplitDesignPrompt(
            customSubject || params.job || 'A premium subject',
            params.mainWord || params.modelName || model || 'NEW EPISODE',
            params.scriptPhrase || params.subtitle || '',
            params.infoLine || params.infoBlock || '',
            colorPrincipale,
            colorSecondaire,
            user?.name || '',
          );
        } else if (model.toLowerCase().includes('diagonal split')) {
          this.logger.log(
            `[processFlyerBackground] Building DIAGONAL_SPLIT prompt: subject="${customSubject || params.job}", titleText="${mainWord}"`,
          );
          magazineStyleDirective = this.buildDiagonalSplitPrompt(
            customSubject || params.job || 'A premium subject',
            params.mainWord || params.modelName || model || '',
            params.scriptPhrase || params.subtitle || '',
            colorPrincipale,
            colorSecondaire,
          );
        } else if (architecture.layoutType === 'TYPE_EDITORIAL_GRID') {
          magazineStyleDirective = this.buildEditorialGridPrompt(
            customSubject || params.job || 'A luxury subject',
            mainWord,
            scriptPhrase,
            colorPrincipale,
            colorSecondaire,
          );
        } else if (architecture.layoutType === 'TYPE_EDITORIAL_REVEAL') {
          this.logger.log(
            `[processFlyerBackground] Building EDITORIAL_REVEAL prompt: subject="${customSubject || params.job}"`,
          );
          magazineStyleDirective = this.buildEditorialRevealPrompt(
            customSubject || params.job || 'A premium subject',
            colorPrincipale,
            colorSecondaire,
          );
        } else if (architecture.layoutType === 'TYPE_EPIC_BRAND') {
          this.logger.log(
            `[processFlyerBackground] Building EPIC_BRAND prompt: subject="${customSubject || params.job}", title="${mainWord}", subtitle="${scriptPhrase}", color="${colorSecondaire}"`,
          );
          magazineStyleDirective = this.buildEpicBrandPrompt(
            customSubject || params.job || 'A premium subject',
            mainWord,
            scriptPhrase,
            colorSecondaire,
          );
        } else if (architecture.layoutType === 'TYPE_NEON_EDITORIAL') {
          this.logger.log(
            `[processFlyerBackground] Building NEON_EDITORIAL prompt: subject="${customSubject || params.job}", title="${mainWord}", subtitle="${scriptPhrase}", color="${colorSecondaire}"`,
          );
          magazineStyleDirective = this.buildNeonEditorialPrompt(
            customSubject || params.job || 'A premium subject',
            mainWord,
            scriptPhrase,
            colorSecondaire,
          );
        } else if (architecture.layoutType === 'TYPE_MATTE_PRODUCT') {
          this.logger.log(
            `[processFlyerBackground] Building MATTE_PRODUCT prompt: subject="${customSubject || params.job}", title="${mainWord}", subtitle="${scriptPhrase}", colorPrincipale="${colorPrincipale}", colorSecondaire="${colorSecondaire}"`,
          );
          magazineStyleDirective = this.buildMatteProductPrompt(
            customSubject || params.job || 'A premium product',
            mainWord,
            scriptPhrase,
            colorPrincipale,
            colorSecondaire,
          );
        } else if (architecture.layoutType === 'TYPE_PROFESSION_ICON') {
          this.logger.log(
            `[processFlyerBackground] Building PROFESSION_ICON prompt: subject="${customSubject || params.job}", title="${mainWord}", subtitle="${scriptPhrase}", isPersonRequested=${isPersonRequested}`,
          );
          magazineStyleDirective = this.buildProfessionIconPrompt(
            customSubject || params.job || 'A professional subject',
            mainWord,
            scriptPhrase,
            isPersonRequested,
          );
        } else if (architecture.layoutType === 'TYPE_MONO_ACCENT') {
          this.logger.log(
            `[processFlyerBackground] Building MONO_ACCENT prompt: subject="${customSubject || params.job}", titleText="${mainWord}", colorPrincipale="${colorPrincipale}", colorSecondaire="${colorSecondaire}", isPersonRequested=${isPersonRequested}`,
          );
          magazineStyleDirective = this.buildMonoAccentPrompt(
            customSubject || params.job || 'A premium subject',
            mainWord,
            scriptPhrase,
            colorPrincipale,
            colorSecondaire,
            isPersonRequested,
          );
        } else if (model.toLowerCase().includes('focus circle')) {
          this.logger.log(
            `[processFlyerBackground] Building FOCUS_CIRCLE prompt: subject="${customSubject || params.job}", titleText="${mainWord}"`,
          );
          magazineStyleDirective = this.buildFocusCirclePrompt(
            customSubject || params.job || 'A premium subject',
            params.mainWord || params.modelName || model || 'NEW EPISODE',
            params.scriptPhrase || params.subtitle || '',
            params.infoLine || params.infoBlock || '',
            colorPrincipale,
            colorSecondaire,
            user?.name || '',
          );
        } else if (model.toLowerCase().includes('editorial reveal')) {
          this.logger.log(
            `[processFlyerBackground] Building EDITORIAL_REVEAL prompt: subject="${customSubject || params.job}"`,
          );
          magazineStyleDirective = this.buildEditorialRevealPrompt(
            customSubject || params.job || 'A premium subject',
            colorPrincipale,
            colorSecondaire,
          );
        } else {
          // Standard magazine-style prompt for other architectures
          magazineStyleDirective = this.buildMagazineStylePrompt(
            model,
            architecture,
            params.job,
            params.userQuery || '',
            brandingColor,
            customSubject,
            isPersonRequested,
          );
        }
      } else {
        this.logger.warn(
          `[processFlyerBackground] No architecture found for model: ${model}. Falling back to generic refinement.`,
        );
        // Detect if the custom subject explicitly asks for a person
        const isPersonRequestedFallback = params.subject
          ? !!params.subject.match(
              /personne|femme|homme|mannequin|fille|garçon|modèle|model|man|woman|girl|boy|person/i,
            )
          : false;

        // Standard magazine-style prompt for other architectures
        magazineStyleDirective = this.buildMagazineStylePrompt(
          model,
          architecture,
          params.job,
          params.userQuery || '',
          brandingColor,
          params.subject || '',
          isPersonRequestedFallback,
        );
      }

      // 4. Refine the query for visual richness (ONLY if no architecture)
      let refinedRes: {
        prompt: string;
        isPostureChange: boolean;
        accentColor?: string;
        lighting?: string;
        angle?: string;
        background?: string;
        primaryObject?: string;
      } = {
        prompt: cleanedUserQuery || params.job,
        isPostureChange: false,
        accentColor: brandingColor || undefined,
        lighting: undefined,
        angle: undefined,
        background: undefined,
        primaryObject: undefined,
      };

      if (!architecture) {
        refinedRes = await this.refineQuery(
          cleanedUserQuery || params.job,
          params.job,
          model,
          flyerLanguage,
          brandingColor,
        );
      }

      // 4. Get specific model description (Only needed if NOT using Magazine/Fashion architectures)
      let baseStylePrompt = '';
      let variantStructurePrompt = '';

      if (!architecture) {
        // Try to find the variant in our centralized categories
        let foundVariant = null;
        let foundStructure = null;

        for (const cat of FLYER_CATEGORIES) {
          for (const m of cat.models) {
            // Case 1: Direct structure on model (e.g. Unified architectures)
            if (m.label === model && m.structure) {
              foundStructure = m.structure;
              break;
            }
            // Case 2: In variants
            if (m.variants) {
              for (const v of m.variants) {
                if (v.label === model) {
                  foundVariant = v;
                  foundStructure = v.structure;
                  break;
                }
              }
            }
            if (foundStructure) break;
          }
          if (foundStructure) break;
        }

        if (foundStructure) {
          this.logger.log(
            `[processFlyerBackground] Found structure for: ${model}`,
          );
          variantStructurePrompt =
            this.getPromptFromVariantStructure(foundStructure);
          baseStylePrompt = this.getModelDescription(model, params.job, {
            accentColor: brandingColor || refinedRes.accentColor,
            lighting: refinedRes.lighting,
            angle: refinedRes.angle,
            background: refinedRes.background,
            logoUrl,
            noLogo: hasNoLogoRequest,
          });
        } else {
          baseStylePrompt = this.getModelDescription(model, params.job, {
            accentColor: brandingColor || refinedRes.accentColor,
            lighting: refinedRes.lighting,
            angle: refinedRes.angle,
            background: refinedRes.background,
            logoUrl,
            noLogo: hasNoLogoRequest,
          });
        }
      }

      let brandingInfoStr = '';
      if (user) {
        const parts = [];
        if (user.professionalPhone)
          parts.push(`Tel: ${user.professionalPhone}`);
        if (user.professionalAddress)
          parts.push(`Adresse: ${user.professionalAddress}`);
        if (user.websiteUrl) parts.push(`Web: ${user.websiteUrl}`);
        brandingInfoStr = parts.join(' | ');
      }

      // 5. ARCHITECTURE-AWARE FLYER TEXT RULES (Enhanced from 78-architecture data)
      // Skip architecture rules if using specialized prompt builders like buildFocusCirclePrompt or buildDiagonalSplitDesignPrompt
      const isUsingSpecializedPromptBuilder =
        (model.toLowerCase().includes('focus circle') &&
          architecture?.layoutType === 'TYPE_FOCUS_CIRCLE') ||
        ((model.toLowerCase().includes('diagonal split design') ||
          model.toLowerCase().includes('diagonal-split-design')) &&
          architecture?.layoutType === 'TYPE_DIAGONAL_SPLIT_DESIGN');

      const architectureRules =
        architecture && !isUsingSpecializedPromptBuilder
          ? `
  ARCHITECTURE DIRECTIVES:
  - SUBJECT POSITIONING: ${params.subject ? `Center the custom subject: "${params.subject}"` : architecture.rules.subject}
  - BACKGROUND STYLING: ${architecture.rules.background}
  - TITLE FORMATTING: ${architecture.rules.title}
  - SUBTITLE STYLING: ${architecture.rules.subtitle}
  - INFO BLOCK PLACEMENT: ${architecture.rules.infoBlock}
  - UPPER ZONE ELEMENTS: ${architecture.rules.upperZone}
  - TECHNICAL CONSTRAINTS: ${architecture.rules.constraints}
        `
          : '';

      // Skip heavy generic rules if architecture prompt builder was used
      const isSpecializedArch = [
        'TYPE_FASHION_VERTICAL',
        'TYPE_EDITORIAL_COVER',
        'TYPE_IMPACT_COMMERCIAL',
        'TYPE_EDITORIAL',
        'TYPE_FOCUS_CIRCLE',
        'TYPE_DIAGONAL_SPLIT_DESIGN',
      ].includes(architecture?.layoutType);

      const flyerTextRule = isSpecializedArch
        ? `STRICT DESIGN RULES: 15% inner margin. No text touching edges. High-end typography ONLY. NO logos, NO background boxes for text. French language. ${architectureRules}`
        : `ELITE GRAPHIC DESIGN & ART DIRECTION RULES: 
             - AESTHETIC: High-end "Vogue" or "Apple-style" minimalism. Absolute focus on REAL-WORLD materials and authentic lighting.
             - COMPOSITION: Masterful use of Negative Space. Subject centered or slightly offset for balance. ${params.subject ? `Ensure the custom subject "${params.subject}" is the hero.` : `Face/head must remain natural and upright. Ensure the person/subject is the hero, with sharp focus and professional depth of field (bokeh).`}
             - TYPOGRAPHIC MASTERY: Typography is NOT just text; it's a design element. USE DYNAMIC HIERARCHY. You are ENCOURAGED to use sophisticated layouts: tilted/angled text, asymmetric balance, and overlapping elements that suggest a human designer's touch.
             - SAFE AREA & MARGINS: Maintain a strict 15% professional inner margin. No text should touch the edges.
             - FONTS: Emulate high-end foundry typefaces (Modern Serifs, Geometric Sans, or Editorial Scripts). 
             - VISUAL HIERARCHY: High-impact Headline must be the focal point. Use professional kerning and leading.
             - CONTENT EVOCATION: Improvise professional French "accroches" (taglines) that feel like real marketing copy based on the job: "${params.job || ''}". Translate the vibe of the "${params.job || ''}" into a sophisticated design language.
               ${brandingInfoStr ? `MANDATORY ATTACHMENT: Include this verified contact detail block subtly but clearly: "${brandingInfoStr}".` : ''}
             - MINIMALISM & CLARITY: AVOID CLUTTER. Limit the scene to ONE main focal object/subject. No unnecessary background items, no crowded compositions. The "Negative Space" must be vast and breathing.
             - LOGO POLICY: STRICTLY PROHIBITED. Do NOT include any logos, company emblems, or brand icons unless explicitly shown in architecture. The design must remain clean, focusing only on typography and photography. The typography must be 100% OPAQUE and SOLID, with ABSOLUTELY NO background boxes, frames, or containers.
             - REALISM PROTECTOR: NO generic AI banners, NO floating plastic ribbons, NO synthetic glows. Every light source must be physically plausible.
             - LANGUAGE: All visible messaging MUST be in ${flyerLanguage}.
             - COPYWRITING: High-level improvisation required. Create evocative, professional hooks that sound like a luxury agency produced them.
             ${architectureRules}`;

      // 5. FINAL PROMPT CONSTRUCTION - ELITE MAGAZINE STYLE
      const customSubjectText =
        params.subject || cleanedUserQuery || params.job || '';
      const subjectSourceDirective = imageBuffer
        ? `USE_UPLOADED_IMAGE_AS_MAIN_SUBJECT: The primary subject of the final generated image MUST be the exact subject, person, or object found in the uploaded reference photo.`
        : `USE_TEXT_AS_MAIN_SUBJECT: The primary subject MUST exactly be: "${customSubjectText}".`;

      const finalPrompt = imageBuffer
        ? `PROFESSIONAL FLYER RE-DESIGN: Transform this image into an elite magazine-quality flyer matching the "${model}" template.
${subjectSourceDirective}
${magazineStyleDirective}
${flyerTextRule}
USER CONTEXT: "${cleanedUserQuery || params.job || ''}"
OUTPUT: Magazine-editorial quality (Vogue/Numéro/Harper's Bazaar standard). ZERO AI artifacts. Photorealistic authenticity.`
        : `ELITE MAGAZINE FLYER GENERATION: Create a professional, high-end flyer for the "${model}" model.
${subjectSourceDirective}
${magazineStyleDirective}
${flyerTextRule}
USER CONTEXT: "${cleanedUserQuery || params.job || ''}"
OUTPUT: Publication-ready editorial quality. Perfect photorealistic rendering. NO digital artifacts, NO cheap AI signatures.`;

      let finalBuffer: Buffer;
      const finalSize = '1024x1536';

      if (imageBuffer) {
        this.logger.log(
          `[processFlyerBackground] Strategy: Image Edit with FLYER prompt. Size: ${finalSize}`,
        );
        finalBuffer = await this.callOpenAiImageEdit(imageBuffer, finalPrompt, {
          size: finalSize,
          quality: 'medium',
          skipRefinement: true,
        });
      } else {
        this.logger.log(
          `[processFlyerBackground] Strategy: Text-to-Image. Size: ${finalSize}`,
        );
        finalBuffer = await this.callOpenAiToolImage(finalPrompt, {
          size: finalSize,
          quality: 'medium',
        });
      }

      // ─── POST-PROCESSING: Focus Circle Filter ───────────────────────────
      // If the architecture is TYPE_FOCUS_CIRCLE, apply the programmatic
      // B&W circle overlay using sharp — DALL-E only generates the base image.
      if (architecture?.layoutType === 'TYPE_FOCUS_CIRCLE') {
        this.logger.log(
          '[processFlyerBackground] Applying Focus Circle post-processing filter...',
        );
        const focusColor =
          params.colorPrincipale ||
          params.colorSecondaire ||
          brandingColor ||
          '#FF9800';
        finalBuffer = await this.compositeFocusCircleFilter(
          finalBuffer,
          focusColor,
        );
        this.logger.log(
          '[processFlyerBackground] Focus Circle filter applied successfully.',
        );
      } else if (
        architecture?.layoutType === 'TYPE_EDITORIAL_REVEAL' ||
        model.toLowerCase().includes('editorial reveal')
      ) {
        this.logger.log(
          `[processFlyerBackground] Applying EDITORIAL_REVEAL Sharp filter for Gen: ${generationId}`,
        );
        finalBuffer = await this.compositeEditorialRevealFilter(finalBuffer);
        this.logger.log(
          '[processFlyerBackground] Editorial Reveal filter applied successfully.',
        );
      }
      // ────────────────────────────────────────────────────────────────────

      const fileName = `flyer_final_${generationId}_${Date.now()}.jpg`;
      const uploadPath = '/home/ubuntu/uploads/ai-generations';
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      const filePath = path.join(uploadPath, fileName);
      fs.writeFileSync(filePath, finalBuffer);

      const imageUrl = `https://hipster-api.fr/uploads/ai-generations/${fileName}`;

      // Update the record with the final image
      await this.aiGenRepo.update(generationId, {
        imageUrl,
        result: 'FLYER',
        attributes: {
          style: model,
          async: true,
          hasSourceImage: !!imageBuffer,
          architectureUsed: architecture?.name || 'GENERIC',
          layoutType: architecture?.layoutType || 'UNKNOWN',
          completedAt: new Date().toISOString(),
          refinementDuration:
            ((Date.now() - startTime) / 1000).toFixed(1) + 's',
          prompt: finalPrompt, // Keep for debugging
        },
      } as any);

      this.logger.log(
        `[processFlyerBackground] SUCCESS - Gen: ${generationId}, URL: ${imageUrl}, Architecture: ${architecture?.name || 'GENERIC'}`,
      );
    } catch (error) {
      this.logger.error(
        `[processFlyerBackground] FAILED for Gen: ${generationId} - ${error.message}`,
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
      `[generateImage] START - User: ${userId}, Style: ${style}. Returning PENDING immediately.`,
    );

    try {
      const styleName = style;

      // 1. Create a PENDING record immediately
      const pendingGen = await this.saveGeneration(
        userId,
        'PENDING',
        params.userQuery || params.job || 'Nouvelle image',
        AiGenerationType.CHAT,
        {
          style: styleName,
          hasSourceImage: !!file,
          async: true,
        },
        undefined,
        existingConversationId,
      );

      // 2. Process in background without awaiting (Refinement + Generation)
      this.processOpenAiToolImageBackground(
        pendingGen.id,
        params,
        userId,
        styleName,
        file?.buffer,
      );

      // 3. Return immediately with isAsync flag
      return {
        id: pendingGen.id,
        generationId: pendingGen.id,
        conversationId: existingConversationId || String(pendingGen.id),
        url: null,
        isAsync: true,
        status: 'PENDING',
        prompt: params.userQuery || params.job || 'Génération en cours...',
        seed: seed,
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
      seed: seed,
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
    existingConversationId?: string,
  ) {
    const model = params.model || 'Anniversaire adulte';
    this.logger.log(
      `[generateFlyer] START - User: ${userId}, Model: ${model}. Returning PENDING immediately.`,
    );

    // Initial placeholder prompt for history
    const initialPrompt = `Génération d'un flyer pour "${model}" en cours...`;

    // 1. Create a PENDING record immediately to avoid timeout
    const pendingGen = await this.saveGeneration(
      userId,
      'PENDING',
      JSON.stringify([
        { role: 'user', content: params.userQuery || 'Nouveau flyer' },
        { role: 'assistant', content: 'Génération du flyer en cours...' },
      ]),
      AiGenerationType.CHAT,
      {
        style: model,
        hasSourceImage: !!file,
        async: true,
      },
      undefined,
      existingConversationId,
    );

    // 2. Process in background without awaiting (Refinement moved here)
    this.processFlyerBackground(
      pendingGen.id,
      params,
      userId,
      model,
      file?.buffer,
    );

    // 3. Return immediately with isAsync flag
    return {
      id: pendingGen.id,
      generationId: pendingGen.id,
      conversationId: existingConversationId || String(pendingGen.id),
      url: null,
      isAsync: true,
      status: 'PENDING',
      prompt: initialPrompt,
      seed: seed,
    };
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

  getFlyerCategories(): FlyerCategory[] {
    return FLYER_CATEGORIES;
  }

  getPromptFromVariantStructure(structure: VariantStructure): string {
    const {
      subject,
      subjectSize,
      title,
      banner,
      particles,
      decorations,
      background,
      colorFilter,
      typography,
      frame,
    } = structure;

    const parts = [
      `ARTISTIC COMPOSITION: The visual focal point (subject) is ${subjectSize !== 'none' ? `sized as "${subjectSize}" and ` : ''}precisely ${subject.replace('-', ' ')} within the frame to balance the negative space.`,
      `TYPOGRAPHIC ARCHITECTURE: Primary title is strategically integrated at the ${title.replace('-', ' ')} location.`,
      banner !== 'none'
        ? `VISUAL ELEMENTS: Features a professional ${banner.replace('-', ' ')} graphic element designed for high-impact messaging.`
        : '',
      particles !== 'none'
        ? `ATMOSPHERIC LAYERING: Subtle organic ${particles.replace('-', ' ')} textures are layered throughout to add depth and professional polish.`
        : '',
      decorations.length > 0
        ? `GRAPHIC ENHANCEMENT: Embellished with designer-grade ${decorations.map((d) => d.replace('-', ' ')).join(', ')} details for a premium look.`
        : '',
      `SCENE TEXTURE: The backdrop utilizes a high-end ${background.replace('-', ' ')} aesthetic, avoiding generic AI surfaces in favor of realistic photographic or studio textures.`,
      `COLOR GRADING: A sophisticated ${colorFilter.replace('-', ' ')} LUT (Look-Up Table) is applied to ensure color harmony and a professional "editor" look.`,
      `FONT DIRECTION: Typography follows a strict ${typography.replace('-', ' ')} hierarchy, evoking the feel of high-end editorial magazines or brand campaigns.`,
      frame !== 'none'
        ? `STRUCTURAL BORDER: Encased in a refined ${frame.replace('-', ' ')} to reinforce the document's professional structure.`
        : '',
    ];

    return parts.filter((p) => !!p).join(' ');
  }
}
