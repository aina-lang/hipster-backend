import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';

import { AiUser } from './entities/ai-user.entity';
import {
  AiGeneration,
  AiGenerationType,
} from './entities/ai-generation.entity';

import {
  AiSubscriptionProfile,
  PlanType,
} from '../profiles/entities/ai-subscription-profile.entity';

import OpenAI from 'openai';

import * as PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

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
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

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
    const start = Date.now();

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: messages,
      });

      const duration = Date.now() - start;
      const content = completion.choices[0].message.content || '';
      console.log(`--- AI RESPONSE RECEIVED (${duration}ms) ---`);

      // PERSIST IF USER ID PROVIDED
      if (userId) {
        const lastUserMsg = messages.filter((m) => m.role === 'user').pop();
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Erreur AI: ${errorMessage}`);
    }
  }

  private async buildPrompt(params: any, userId?: number): Promise<string> {
    const {
      job,
      function: funcName,
      context,
      userQuery,
      workflowAnswers,
      instructions = '',
    } = params;

    let identityContext = '';
    let userName = "l'utilisateur";

    if (userId) {
      const userObj = await this.getAiUserWithProfile(userId);
      if (userObj) {
        userName = userObj.firstName || userObj.email;
        const profile = userObj.aiProfile;
        if (profile) {
          const parts = [
            `Nom: ${profile.companyName || userName}`,
            profile.professionalEmail
              ? `Email: ${profile.professionalEmail}`
              : '',
            profile.professionalAddress || profile.city || profile.postalCode
              ? `Adresse: ${profile.professionalAddress || ''} ${profile.city || ''} ${profile.postalCode || ''}`.trim()
              : '',
            profile.professionalPhone
              ? `Tél: ${profile.professionalPhone}`
              : '',
            profile.websiteUrl ? `Site: ${profile.websiteUrl}` : '',
          ].filter(Boolean);

          if (parts.length > 0) {
            identityContext = `INFOS CONTACT/BRADING:\n${parts.join('\n')}`;
          }
        }
      }
    }

    const cleanFunction = (funcName || 'Création de contenu')
      .replace(/\s*\(.*?\)\s*/g, '')
      .trim();

    const isSocial =
      params.function?.toLowerCase().includes('réseaux') ||
      params.category === 'Social';

    const workflowDetails = workflowAnswers
      ? Object.entries(workflowAnswers)
          .filter(([k]) => isSocial || k !== 'platform') // Filter out platform for non-social
          .map(([k, v]) => `• ${k.replace(/_/g, ' ').toUpperCase()}: ${v}`)
          .join('\n')
      : '';

    const parts = [
      `Métier: ${job || 'Non spécifié'}`,
      `Type de contenu: ${cleanFunction}`,
      workflowDetails ? `Détails de personnalisation:\n${workflowDetails}` : '',
      context ? `Contexte supplémentaire: ${context}` : '',
      userQuery ? `Demande spécifique de l'utilisateur: ${userQuery}` : '',
      params.instruction_speciale
        ? `NOTE IMPORTANTE: ${params.instruction_speciale}`
        : '',
      instructions ? `Instructions de formatage: ${instructions}` : '',
      identityContext ? `\n${identityContext}` : '',
    ].filter(Boolean);

    const fullPrompt = parts.join('\n\n');
    console.log('--- BUILT PROMPT ---');
    console.log(fullPrompt);
    return fullPrompt;
  }

  async generateText(
    params: any,
    type: string,
    userId?: number,
  ): Promise<{ content: string; generationId?: number }> {
    // Backward compatibility or direct prompt
    if (typeof params === 'string') {
      params = { userQuery: params };
    }

    const basePrompt = await this.buildPrompt(params, userId);

    const systemContext = `
      Identité: Hipster IA
      Rôle: Expert assistant créatif
      Contexte: Génération de contenu ${type}
      
      RÈGLE CRITIQUE: N'INVENTE JAMAIS d'informations que le client n'a pas fournies. 
      Ne crée pas de prix, d'horaires d'ouverture, de services spécifiques ou de détails techniques si ils ne sont pas explicitement mentionnés dans le prompt ou le profil. 
      Si une information manque, reste général ou n'en parle pas.
    `;

    let jsonInstruction =
      'Réponds au format JSON si possible pour une meilleure extraction des données, sinon utilise un format clair et structuré. IMPORTANT: Pas de mise en forme Markdown (**) dans les valeurs textuelles.';

    const func = (params.function || '').toLowerCase();
    const answers = params.workflowAnswers || {};
    const section = answers.section || '';
    const tone = answers.tone || '';

    if (func.includes('site internet')) {
      const sectionPrompt = section
        ? `TU NE DOIS GÉNÉRER QUE LE CONTENU DE LA SECTION : "${section}". INTERDICTION de créer d'autres sections ou un titre de page global.`
        : "Génère le contenu pour la page d'accueil.";

      jsonInstruction = `
        Réponds OBLIGATOIREMENT au format JSON avec les clés suivantes :
        - "titre_section": Le titre de la section.
        - "contenu": Le corps du texte (TEXTE BRUT UNIQUEMENT, pas de balises HTML, pas de gras **).
        - "conseils_balisage": Un tableau de chaînes indiquant la structure conseillée (ex: ["titre -> h2", "contenu -> p", "appel_a_l_action -> button"]).
        - "appel_a_l_action": Le texte pour un bouton.

        RÈGLE ABSOLUE : ${sectionPrompt}
        IMPORTANT: Le ton doit être "${tone || 'professionnel'}".
      `;
    } else if (func.includes('seo')) {
      const pageFocus = section
        ? `spécifiquement pour la page/section "${section}"`
        : '';
      jsonInstruction = `
        Réponds OBLIGATOIREMENT au format JSON avec les clés suivantes :
        - "balise_title": Titre SEO optimisé.
        - "meta_description": Description SEO.
        - "mots_cles": Un tableau de mots-clés optimisés ${pageFocus}.
        - "structure_h_n": Un tableau de recommandations de balises (ex: ["titre -> h1", "sous-titre -> h2"]).
        - "conseils_optimisation": Conseils techniques.

        IMPORTANT: Le ton doit être "${tone || 'expert'}". Pas de balises HTML dans les textes, seulement des conseils de structure.
      `;
    } else if (func.includes('flyer') || func.includes('affiche')) {
      jsonInstruction = `
        Réponds OBLIGATOIREMENT au format JSON avec les clés suivantes :
        - "titre_affiche": Le titre principal ou l'accroche.
        - "contenu_texte": Le corps du texte promotionnel ou informatif (TEXTE BRUT).
        - "liste_points_forts": Un tableau avec les points clés à mettre en avant (offres, atouts, etc.).
        - "appel_a_l_action": Texte pour l'incitation à l'action.
        - "conseils_visuels": Suggestions pour le design graphique (couleurs, style, disposition).

        IMPORTANT: Le ton doit être "${tone || 'percutant'}".
        Base-toi uniquement sur les informations fournies (userQuery, details). N'invente pas de prix ou d'offres non mentionnés.
      `;
    }

    const messages = [
      {
        role: 'system',
        content: `Tu es Hipster IA. Voici ta configuration :\n${systemContext}\n\n${
          type === 'social'
            ? "Réponds avec un format clair et structuré (pas de JSON). IMPORTANT: N'utilise JAMAIS de mise en forme Markdown comme les doubles astérisques (**) pour le gras. Produis du texte brut et propre."
            : jsonInstruction
        }`,
      },
      { role: 'user', content: basePrompt },
    ];

    const result = await this.chat(messages);

    let generationId: number | undefined;
    if (userId) {
      const saved = await this.aiGenRepo.save({
        user: { id: userId } as AiUser,
        type: AiGenerationType.TEXT,
        prompt: basePrompt.substring(0, 1000), // Save part of the constructed prompt
        result: result,
        title: (params.userQuery || 'Sans titre').substring(0, 30) + '...',
        attributes: params, // Persist full context attributes
      });
      generationId = saved.id;
    }

    return { content: result, generationId };
  }

  /* -------------------------------------------------------- */
  /*                   LIMIT ENFORCEMENT                      */
  /* -------------------------------------------------------- */
  private async checkLimits(
    userId: number,
    type: AiGenerationType,
  ): Promise<void> {
    const userProfile = await this.getAiUserWithProfile(userId);
    const plan = userProfile?.aiProfile?.planType || PlanType.CURIEUX;

    // 1. Check if Pack Curieux
    if (plan === PlanType.CURIEUX) {
      // A. Check Trial Duration (7 days)
      const createdAt = userProfile.createdAt; // Assuming user creation is start of trial
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - createdAt.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 7) {
        throw new Error(
          "Votre période d'essai de 7 jours est terminée. Veuillez choisir un plan.",
        );
      }

      // B. Check Daily Limits
      // Limits: 2 images/day, 3 texts/day
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const count = await this.aiGenRepo.count({
        where: {
          user: { id: userId },
          type: type,
          createdAt: MoreThan(today),
        },
      });

      if (type === AiGenerationType.IMAGE && count >= 2) {
        throw new Error(
          'Limite atteinte : 2 images par jour avec le Pack Curieux.',
        );
      }
      if (type === AiGenerationType.TEXT && count >= 3) {
        throw new Error(
          'Limite atteinte : 3 textes par jour avec le Pack Curieux.',
        );
      }
    }

    // 2. Check Atelier Limits
    if (plan === PlanType.ATELIER) {
      if (type === AiGenerationType.VIDEO || type === AiGenerationType.AUDIO) {
        throw new Error(
          'Le plan Atelier ne permet pas la génération Audio/Vidéo.',
        );
      }
    }
  }

  async generateImage(
    params: any,
    style: 'realistic' | 'cartoon' | 'sketch',
    userId?: number,
  ): Promise<{ url: string; generationId?: number }> {
    if (userId) {
      await this.checkLimits(userId, AiGenerationType.IMAGE);
    }

    /* ------------------------------------------ */
    /*           1. Normalize input               */
    /* ------------------------------------------ */
    if (typeof params === 'string') {
      params = { userQuery: params };
    }

    const basePrompt = await this.buildPrompt(params, userId);
    const userQuery = params.userQuery || '';

    /* ------------------------------------------ */
    /*        2. GPT Prompt Optimization          */
    /* ------------------------------------------ */
    const gptMessages = [
      {
        role: 'system',
        content: `You are an elite art director preparing a PERFECT PROMPT for Stable Diffusion Core.

RULES:
1. Output JSON ONLY.
2. Structure the prompt with "Subject, details, style, lighting, camera".
3. TEXT HANDLING:
   - Stable Diffusion Core handles text poorly inside images. 
   - DO NOT include "text: ..." instructions unless CRITICAL.
   - Focus on visual description.
4. Keep JSON minimal.

FORMAT:
{
  "visual_description": "string",
  "negative_prompt": "string"
}`,
      },
      { role: 'user', content: userQuery },
    ];

    let parsed = {
      visual_description: userQuery,
      negative_prompt: '',
    };

    try {
      const gptResponse = await this.chat(gptMessages);
      parsed = JSON.parse(gptResponse.replace(/```json|```/g, ''));
    } catch (e) {
      console.warn('GPT parse failed, fallback used.');
    }

    /* ------------------------------------------ */
    /*           3. Configure Stability           */
    /* ------------------------------------------ */
    // User key priority
    const apiKey =
      this.configService.get<string>('STABLE_API_KEY') ||
      this.configService.get<string>('STABILITY_API_KEY');
    if (!apiKey) {
      throw new Error('Configuration manquante : STABLE_API_KEY');
    }

    /* Style Mapping */
    let stylePreset = 'enhance'; // default
    if (style === 'realistic') stylePreset = 'photographic';
    if (style === 'cartoon') stylePreset = 'comic-book';
    if (style === 'sketch') stylePreset = 'line-art';

    const formData = new FormData();
    formData.append('prompt', parsed.visual_description);
    if (parsed.negative_prompt) {
      formData.append('negative_prompt', parsed.negative_prompt);
    }
    formData.append('style_preset', stylePreset);
    formData.append('output_format', 'png');
    // formData.append('aspect_ratio', '1:1'); // Default is 1:1

    console.log('--- CALLING STABILITY AI ---');
    console.log('Prompt:', parsed.visual_description);
    console.log('Style:', stylePreset);

    /* ------------------------------------------ */
    /*           4. Call API & Save File          */
    /* ------------------------------------------ */
    try {
      const response = await fetch(
        'https://api.stability.ai/v2beta/stable-image/generate/sd3',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'image/*',
          },
          body: formData,
        },
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error('Stability API Error:', errText);
        throw new Error(
          `Stability Error: ${response.status} ${response.statusText}`,
        );
      }

      const buffer = await response.arrayBuffer();

      // Ensure directory exists
      const uploadDir = path.join(process.cwd(), 'uploads', 'ai-generations');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Save file
      const fileName = `gen_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.png`;
      const filePath = path.join(uploadDir, fileName);

      fs.writeFileSync(filePath, Buffer.from(buffer));

      // Construct Public URL
      // NOTE: Verify your server's domain/IP config.
      // Using hardcoded base for now based on client.ts info, or relative if served from same origin.
      // Ideally use ConfigService for BASE_URL.
      const publicUrl = `https://hipster-api.fr/uploads/ai-generations/${fileName}`;

      console.log('Image saved to:', filePath);
      console.log('Public URL:', publicUrl);

      /* ------------------------------------------ */
      /*      5. Save History & Return            */
      /* ------------------------------------------ */
      let generationId: number | undefined;

      if (userId) {
        const saved = await this.aiGenRepo.save({
          user: { id: userId } as AiUser,
          type: AiGenerationType.IMAGE,
          prompt: basePrompt.substring(0, 1000),
          result: publicUrl,
          title: (params.userQuery || 'Stable Image').substring(0, 40),
          attributes: { ...params, engine: 'stable-diffusion' },
        });
        generationId = saved.id;
      }

      return { url: publicUrl, generationId };
    } catch (error) {
      console.error('STABILITY GENERATION ERROR:', error);
      // Preserve the original error message for better debugging
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(
        `Erreur lors de la génération d'image (Stability): ${errorMessage}`,
      );
    }
  }

  async generateSocial(
    params: any,
    userId?: number,
  ): Promise<{ content: string; url: string; generationId?: number }> {
    // Backward compatibility
    if (typeof params === 'string') {
      params = { userQuery: params };
    }

    console.log('--- GENERATE SOCIAL (Post + Image) ---');

    // Parallel generation for speed and reliability
    try {
      const [textRes, imageRes] = await Promise.all([
        this.generateText(
          {
            ...params,
            instructions:
              "Génère une légende percutante pour un post réseaux sociaux (Instagram, Facebook). Inclus des hashtags pertinents. N'inclus pas de suggestions d'images. IMPORTANT: Inclus les coordonnées de contact (adresse, téléphone, site) si elles sont fournies dans le contexte. IMPORTANT: N'INVENTE AUCUN PRIX, SERVICE OU HORAIRE NON MENTIONNÉ. IMPORTANT: N'UTILISE JAMAIS DE GRAS (**) OU DE MISE EN FORME MARKDOWN. RÉPONDS UNIQUEMENT AVEC LE TEXTE DE LA LÉGENDE BRUT. PAS DE JSON. PAS DE BLOC DE CODE.",
          },
          'social',
          userId,
        ),
        this.generateImage(
          {
            ...params,
            instructions:
              'A high-quality, professional social media post image. Photorealistic, aesthetically pleasing, suitable for Instagram.',
          },
          'realistic',
          userId,
        ),
      ]);

      console.log('--- SOCIAL GENERATION PREVIEW ---');
      console.log('Text result length:', textRes?.content?.length);
      console.log('Image URL:', imageRes?.url);

      return {
        content: textRes.content,
        url: imageRes.url,
        generationId: textRes.generationId,
      };
    } catch (error) {
      console.error('--- SOCIAL GEN ERROR ---', error);
      throw error;
    }
  }

  async generateDocument(
    type: 'legal' | 'business',
    params: any,
    userId?: number,
  ): Promise<{ content: string; generationId?: number }> {
    // 1. Build Base Context via centralized method
    const baseContext = await this.buildPrompt(params, userId);

    const {
      format: requestedFormat,
      function: funcName,
      userProfile,
      ...restParams
    } = params;

    // Clean format hints like "(PDF / DOCX)"
    const cleanFunctionName = (funcName || 'Document')
      .replace(/\s*\(.*?\)\s*/g, '')
      .trim();

    const isQuoteEstimate = /devis|estimation|estimate/i.test(
      cleanFunctionName,
    );

    // Entity name (Company or User)
    const entityName =
      userProfile?.companyName ||
      (userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : null);

    let prompt = '';

    /* -------------------------------------------------------------------------- */
    /*                         CASE A — QUOTE / ESTIMATION                        */
    /* -------------------------------------------------------------------------- */
    if (isQuoteEstimate) {
      let docNumber = 'DOC-001';

      // Generate incremental document number
      if (userId) {
        const count = await this.aiGenRepo.count({
          where: { user: { id: userId }, type: AiGenerationType.DOCUMENT },
        });

        const prefix = 'DEVIS';
        const year = new Date().getFullYear();
        docNumber = `${prefix}-${year}-${String(count + 1).padStart(3, '0')}`;
      }

      // Sender details
      const senderInfo = userProfile
        ? {
            company:
              userProfile.companyName ||
              `${userProfile.firstName} ${userProfile.lastName}`,
            address: userProfile.professionalAddress,
            city: `${userProfile.postalCode || ''} ${userProfile.city || ''}`.trim(),
            phone: userProfile.professionalPhone,
            email: userProfile.professionalEmail,
            siret: userProfile.siret,
            bank: userProfile.bankDetails,
          }
        : {};

      const senderContext =
        Object.keys(senderInfo).length > 0
          ? `Voici les infos de l'émetteur : ${JSON.stringify(senderInfo)}`
          : 'Infos émetteur non fournies (laisser les champs vides ou mettre "A compléter").';

      /* ----------------------------- QUOTE PROMPT ----------------------------- */
      prompt = `
Génère un document "${cleanFunctionName}" basé sur ce contexte :
${baseContext}

${senderContext}

MODE ESTIMATEUR INTELLIGENT :
1. Numéro du document : "${docNumber}"
2. Estimation :
   - Liste uniquement les services/produits mentionnés par le client.
   - Si des prix ne sont pas fournis, utilise des valeurs "0" ou des placeholders "[PRIX]" pour ne pas inventer.
   - N'invente PAS de services additionnels.
3. Structure : Document professionnel de type DEVIS.
4. TVA : 20%
5. Validité : 30 jours

IMPORTANT : Tu dois répondre UNIQUEMENT avec ce JSON valide :

{
  "type": "invoice",
  "sender": { "name": "...", "address": "...", "contact": "...", "siret": "...", "bank": "..." },
  "client": { "name": "Client", "address": "..." },
  "items": [
    { "description": "Description...", "quantity": 1, "unitPrice": 100, "total": 100 }
  ],
  "totals": { "subtotal": 0, "taxRate": 20, "taxAmount": 0, "total": 0 },
  "meta": { "date": "JJ/MM/AAAA", "dueDate": "JJ/MM/AAAA", "number": "${docNumber}" },
  "legal": "Mentions légales..."
}
`.trim();
    } else {
      /* -------------------------------------------------------------------------- */
      /*                  CASE B — GENERIC BUSINESS DOCUMENT (UNIFORM)              */
      /* -------------------------------------------------------------------------- */
      const docTitle = cleanFunctionName.toUpperCase();

      prompt = `
Génère un document "${docTitle}" structuré basé sur ce contexte :
${baseContext}

IMPORTANT : Tu dois impérativement répondre avec un objet JSON valide suivant cette structure :
{
  "title": "${docTitle}",
  "presentation": "Bref texte d'introduction (3-5 phrases)",
  "sections": [
    {
      "title": "Titre de section",
      "content": "Contenu détaillé de la section",
      "table": [
        ["Colonne 1", "Colonne 2", "Colonne 3"],
        ["Valeur 1", "Valeur 2", "Valeur 3"]
      ]
    }
  ],
  "conclusion": "Phrase courte et professionnelle"
}

Règles de rédaction :
- Le contenu doit être professionnel et complet.
- INTERDICTION ABSOLUE D'INVENTER : Si l'utilisateur n'a pas fourni de liste de services ou de prix dans les paramètres, NE REMPLIS PAS LE TABLEAU. Laisse le tableau vide "[]" ou absente-le. N'écris PAS "Liste à définir".
- N'invente pas de nom d'entreprise "Hipster Marketing" ou autre. Utilise uniquement le nom "entityName" fourni ou un placeholder "[NOM DE L'ENTREPRISE]".
- Si des prestations sont listées par le client, utilise le champ "table" pour les structurer. Sinon, pas de tableau inventé.
`.trim();
    }

    /* -------------------------------------------------------------------------- */
    /*                              GENERATION AI                                 */
    /* -------------------------------------------------------------------------- */
    const { content: resultText, generationId: textGenId } =
      await this.generateText(prompt, 'business', userId);

    /* -------------------------------------------------------------------------- */
    /*                        SAVE GENERATION HISTORY                              */
    /* -------------------------------------------------------------------------- */
    let generationId: number | undefined;

    if (userId) {
      try {
        const latestGen = await this.aiGenRepo.findOne({
          where: { user: { id: userId }, type: AiGenerationType.TEXT },
          order: { createdAt: 'DESC' },
        });

        if (latestGen) {
          latestGen.type = AiGenerationType.DOCUMENT;
          if (params.workflowAnswers) {
            latestGen.attributes = params.workflowAnswers;
          }
          const savedGen = await this.aiGenRepo.save(latestGen);
          generationId = savedGen.id;
        }
      } catch (error) {}
    }

    return { content: resultText, generationId: generationId || textGenId };
  }

  async deleteGeneration(id: number, userId: number): Promise<void> {
    console.log(`[AiService] Deleting generation ${id} for user ${userId}`);
    const gen = await this.aiGenRepo.findOne({
      where: { id, user: { id: userId } },
    });
    if (!gen) {
      console.warn(
        `[AiService] Generation ${id} not found or not owned by user ${userId}`,
      );
      throw new Error('Generation not found');
    }
    await this.aiGenRepo.remove(gen);
    console.log(`[AiService] Generation ${id} deleted successfully`);
  }

  async clearHistory(userId: number): Promise<void> {
    console.log(`[AiService] Clearing history for user ${userId}`);
    const gens = await this.aiGenRepo.find({
      where: { user: { id: userId } },
    });
    if (gens.length > 0) {
      console.log(`[AiService] Found ${gens.length} items to delete`);
      await this.aiGenRepo.remove(gens);
      console.log(`[AiService] History cleared successfully`);
    } else {
      console.log(`[AiService] No history found to clear`);
    }
  }

  async exportDocument(
    id: number,
    format: string,
    userId: number,
    modelOverride?: string,
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const generation = await this.aiGenRepo.findOne({
      where: { id, user: { id: userId } },
    });

    if (!generation) {
      throw new Error('Document non trouvé');
    }

    // Check for 'Pack Curieux' restriction
    const userProfile = await this.getAiUserWithProfile(userId);
    const planType = userProfile?.aiProfile?.planType || 'curieux';

    if (planType === 'curieux') {
      throw new Error(
        "L'export et le téléchargement ne sont pas disponibles avec le Pack Curieux.",
      );
    }

    const contentData = this.parseDocumentContent(generation.result);
    const model = modelOverride || generation.attributes?.model || 'Moderne';

    // Fetch user profile for branding
    const user = await this.getAiUserWithProfile(userId);
    const branding = user?.aiProfile || {};

    console.log('Exporting with model:', model);

    const fileName = `document_${id}.${format}`;
    let buffer: Buffer;
    let mimeType: string;

    switch (format.toLowerCase()) {
      case 'pdf':
        buffer = await this.generatePdfBuffer(contentData, model, branding);
        mimeType = 'application/pdf';
        break;
      case 'docx':
        buffer = await this.generateDocxBuffer(contentData);
        mimeType =
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      case 'xlsx':
      case 'excel':
        buffer = await this.generateExcelBuffer(contentData);
        mimeType =
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;
      case 'image':
      case 'png':
        buffer = await this.generateImageBuffer(contentData, model, branding);
        mimeType = 'image/png';
        break;
      default:
        throw new Error('Format non supporté');
    }

    return { buffer, fileName, mimeType };
  }

  private parseDocumentContent(text: string): any {
    console.log('--- Parsing Document Content ---');
    console.log('Raw AI Output:', text);

    // 1. Try JSON Parsing
    try {
      // Find JSON object boundaries
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');

      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonStr = text.substring(jsonStart, jsonEnd + 1);
        const data = JSON.parse(jsonStr);

        // Case A: Structured Invoice/Quote
        if (
          data.items ||
          data.sender ||
          data.type === 'invoice' ||
          data.type === 'quote'
        ) {
          console.log('Detected Structured Invoice/Quote JSON');
          return data;
        }

        // Case C: New Structured Document JSON
        if (data.presentation || data.sections || data.conclusion) {
          console.log('Detected Structured Document JSON');
          return {
            title: data.title || 'Document',
            presentation: data.presentation || '',
            sections: Array.isArray(data.sections)
              ? data.sections.map((s: any) => ({
                  title: s.title || '',
                  text: s.content || '',
                  table: s.table || null,
                }))
              : [],
            conclusion: data.conclusion || '',
          };
        }

        // Case B: Minified Generic JSON (Legacy/Other)
        if (data.t || data.s) {
          return {
            title: data.t || 'Document',
            sections: Array.isArray(data.s)
              ? data.s.map((sec: any) => ({
                  title: sec.st || '',
                  text: sec.c || '',
                }))
              : [],
          };
        }
      }
    } catch (e) {
      console.warn(
        'JSON parsing failed, falling back to Markdown/Text parser',
        e,
      );
    }

    // 2. Fallback: Markdown Parser
    const docData: any = {
      title: 'Document',
      sections: [],
    };

    const lines = text.split('\n');
    let currentSection: any = null;

    lines.forEach((line) => {
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('# ')) {
        // Main Title
        docData.title = trimmedLine.substring(2).trim();
      } else if (trimmedLine.startsWith('## ')) {
        // New Section
        if (currentSection) {
          docData.sections.push(currentSection);
        }
        currentSection = {
          title: trimmedLine.substring(3).trim(),
          text: '',
        };
      } else {
        // Content
        if (currentSection) {
          currentSection.text += line + '\n';
        } else if (!trimmedLine.startsWith('#') && trimmedLine.length > 0) {
          if (docData.sections.length === 0 && !currentSection) {
            currentSection = { title: 'Introduction', text: line + '\n' };
          } else if (currentSection) {
            currentSection.text += line + '\n';
          }
        }
      }
    });

    if (currentSection) {
      docData.sections.push(currentSection);
    }

    // Clean up text
    docData.sections.forEach((sec: any) => {
      sec.text = sec.text.trim();
    });

    if (docData.sections.length === 0) {
      // Fallback if no markdown structure found
      return {
        title: 'Document Généré',
        sections: [{ title: 'Contenu', text }],
      };
    }

    return docData;
  }

  private extractToonBlocks(text: string): string[] {
    // Allow optional whitespace and case insensitivity
    const regex = /toon\s*\{[\s\S]*?\}/gi;
    return text.match(regex) || [];
  }

  private async generatePdfBuffer(
    data: any,
    model: string = 'Moderne',
    branding: any = {},
  ): Promise<Buffer> {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      const htmlContent = this.getDocumentHtml(data, model, branding);
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
      });

      await browser.close();
      return Buffer.from(pdfBuffer);
    } catch (error) {
      console.error('PDF generation error:', error);
      if (browser) await browser.close();
      throw error;
    }
  }

  private async generateDocxBuffer(data: any): Promise<Buffer> {
    const children = [
      new Paragraph({
        children: [
          new TextRun({ text: data.title || 'Document', bold: true, size: 32 }),
        ],
      }),
    ];

    if (data.sections && Array.isArray(data.sections)) {
      data.sections.forEach((section: any) => {
        children.push(new Paragraph({ text: '' }));
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: section.title || '', bold: true, size: 28 }),
            ],
          }),
        );
        children.push(new Paragraph({ text: section.text || '' }));
      });
    } else {
      children.push(new Paragraph({ text: JSON.stringify(data, null, 2) }));
    }

    const doc = new Document({ sections: [{ children }] });
    return (await Packer.toBuffer(doc)) as Buffer;
  }

  private async generateExcelBuffer(data: any): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Document');

    sheet.columns = [
      { header: 'Section', key: 'section', width: 30 },
      { header: 'Contenu', key: 'content', width: 70 },
    ];

    if (data.sections && Array.isArray(data.sections)) {
      data.sections.forEach((section: any) => {
        sheet.addRow({ section: section.title, content: section.text });
      });
    } else {
      sheet.addRow({ section: 'Contenu', content: JSON.stringify(data) });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async applyWatermark(imageUrl: string, isPremium: boolean): Promise<string> {
    if (isPremium) {
      return imageUrl; // No watermark for premium
    }
    // Mock watermark logic
    return `${imageUrl}&watermark=hipster_studio`;
  }

  private async generateImageBuffer(
    data: any,
    model: string = 'Moderne',
    branding: any = {},
  ): Promise<Buffer> {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      const htmlContent = this.getDocumentHtml(data, model, branding);
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      // Auto-size viewport to content
      const bodyHandle = await page.$('body');
      const box = await bodyHandle.boundingBox();
      if (box) {
        await page.setViewport({
          width: Math.ceil(box.width),
          height: Math.ceil(box.height),
        });
      }

      const imageBuffer = await page.screenshot({ fullPage: true });
      await browser.close();
      return Buffer.from(imageBuffer);
    } catch (error) {
      console.error('Image generation error:', error);
      await browser.close();
      throw error;
    }
  }

  private getDocumentHtml(
    data: any,
    model: string = 'Moderne',
    branding: any = {},
  ): string {
    const title = data.title || 'Document';
    const presentation = data.presentation || '';
    const sections = data.sections || [];
    const conclusion = data.conclusion || '';

    // Branding info
    const logoUrl = branding.logoUrl
      ? branding.logoUrl.startsWith('http')
        ? branding.logoUrl
        : `${this.configService.get('API_URL') || 'https://hipster-api.fr'}${branding.logoUrl}`
      : null;
    const companyName = branding.companyName || '';
    const contactInfo = `
      ${branding.professionalAddress || ''} ${branding.postalCode || ''} ${branding.city || ''}
      ${branding.professionalPhone ? ` | Tél: ${branding.professionalPhone}` : ''}
      ${branding.professionalEmail ? ` | Email: ${branding.professionalEmail}` : ''}
    `.trim();

    let themeStyles = '';

    // THEMES CSS
    if (model === 'Minimaliste') {
      themeStyles = `
        body { background: #ffffff; color: #000000; font-family: 'Helvetica', sans-serif; }
        h1 { color: #000; border-bottom: 1px solid #000; padding-bottom: 5px; font-weight: 300; text-transform: uppercase; letter-spacing: 2px; }
        .section-title { color: #333; border-left: 3px solid #000; padding-left: 10px; font-size: 18px; text-transform: uppercase; }
        th { background: #f0f0f0; color: #000; border-bottom: 2px solid #000; }
        td { border-bottom: 1px solid #eee; }
      `;
    } else if (model === 'Luxe') {
      themeStyles = `
        body { background: #0a0a0a; color: #ffffff; font-family: 'Georgia', serif; }
        h1 { color: #D4AF37; border-bottom: 2px solid #D4AF37; font-style: italic; }
        .section-title { color: #D4AF37; font-variant: small-caps; border-bottom: 1px solid rgba(212, 175, 55, 0.3); }
        table { border: 1px solid #D4AF37; }
        th { background: #D4AF37; color: #000; }
        td { border-bottom: 1px solid rgba(212, 175, 55, 0.2); }
        .conclusion { color: #D4AF37; }
      `;
    } else if (model === 'Coloré') {
      themeStyles = `
        body { background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); color: #2d3436; }
        .container { background: white; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); padding: 40px; }
        h1 { background: linear-gradient(to right, #6c5ce7, #00cec9); -webkit-background-clip: text; -webkit-text-fill-color: transparent; border-bottom: none; }
        .section-title { color: #6c5ce7; font-weight: 800; }
        th { background: #6c5ce7; color: white; border-radius: 5px 5px 0 0; }
        tr:nth-child(even) { background-color: #f1f2f6; }
      `;
    } else {
      // MODERNE (Default Hipster Style)
      themeStyles = `
        body { background: #0a0a0a; color: #ffffff; font-family: 'Helvetica', sans-serif; }
        h1 { color: #00FFAA; text-shadow: 0 0 10px rgba(0,255,170,0.3); border-bottom: 2px solid #00FFAA; }
        .section-title { color: #00FFAA; text-transform: uppercase; letter-spacing: 1px; }
        th { background: #00FFAA; color: #000; }
        td { border-bottom: 1px solid rgba(255,255,255,0.1); }
        .conclusion { color: #00FFAA; }
      `;
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { line-height: 1.6; padding: 40px; margin: 0; display: flex; justify-content: center; }
          .container { width: 100%; max-width: 800px; }
          h1 { text-align: center; padding-bottom: 10px; margin-bottom: 30px; font-size: 32px; }
          .presentation { font-size: 16px; margin-bottom: 30px; line-height: 1.8; opacity: 0.9; }
          .section { margin-bottom: 30px; }
          .section-title { font-size: 20px; margin-bottom: 15px; font-weight: bold; }
          .section-text { font-size: 15px; margin-bottom: 15px; opacity: 0.8; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { padding: 12px; text-align: left; font-size: 14px; }
          td { padding: 12px; font-size: 14px; }
          .conclusion { margin-top: 40px; padding-top: 20px; border-top: 1px solid rgba(128,128,128,0.2); font-style: italic; font-size: 15px; }
          
          /* BRANDING STYLES */
          .branding-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 40px; border-bottom: 2px solid rgba(128,128,128,0.1); padding-bottom: 20px; }
          .branding-logo { max-height: 60px; max-width: 150px; }
          .branding-info { text-align: right; font-size: 12px; opacity: 0.8; }
          .branding-footer { margin-top: 50px; text-align: center; font-size: 11px; opacity: 0.5; border-top: 1px solid rgba(128,128,128,0.1); padding-top: 10px; }
          
          ${themeStyles}
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Header Branding -->
          <div class="branding-header">
            <div class="branding-logo-box">
              ${logoUrl ? `<img src="${logoUrl}" class="branding-logo" />` : `<span style="font-size: 24px; font-weight: bold;">${companyName}</span>`}
            </div>
            <div class="branding-info">
              ${companyName ? `<div style="font-weight: bold; margin-bottom: 5px;">${companyName}</div>` : ''}
              <div>${contactInfo}</div>
              ${branding.websiteUrl ? `<div>${branding.websiteUrl}</div>` : ''}
            </div>
          </div>

          <h1>${title}</h1>
          ${presentation ? `<div class="presentation">${presentation}</div>` : ''}
          
          ${sections
            .map(
              (s: any) => `
            <div class="section">
              ${s.title ? `<div class="section-title">${s.title}</div>` : ''}
              ${s.text || s.content ? `<div class="section-text">${s.text || s.content}</div>` : ''}
              ${
                s.table && Array.isArray(s.table) && s.table.length > 0
                  ? `
                <table>
                  <thead>
                    <tr>
                      ${s.table[0].map((h: string) => `<th>${h}</th>`).join('')}
                    </tr>
                  </thead>
                  <tbody>
                    ${s.table
                      .slice(1)
                      .map(
                        (row: any[]) => `
                      <tr>
                        ${row.map((cell) => `<td>${cell}</td>`).join('')}
                      </tr>
                    `,
                      )
                      .join('')}
                  </tbody>
                </table>
              `
                  : ''
              }
            </div>
          `,
            )
            .join('')}

          ${conclusion ? `<div class="conclusion">${conclusion}</div>` : ''}

          <!-- Footer Branding -->
          <div class="branding-footer">
            Document généré par Hipster•IA pour ${companyName || 'votre entreprise'}.
            ${branding.siret ? ` | SIRET: ${branding.siret}` : ''}
          </div>
        </div>
      </body>
      </html>
      `;
  }

  /**
   * Helper method to build optimized Stable Diffusion prompt for flyer generation
   */
  private async buildFlyerPrompt(
    params: any,
    userId?: number,
  ): Promise<string> {
    const baseContext = await this.buildPrompt(params, userId);

    const gptMessages = [
      {
        role: 'system',
        content: `Tu es un expert en design de flyers marketing et en prompts Stable Diffusion.

Crée un prompt Stable Diffusion pour générer un FLYER VISUEL professionnel et attractif.

RÈGLES IMPORTANTES:
1. Stable Diffusion Core ne gère PAS BIEN le texte dans les images
2. Focus sur l'AMBIANCE VISUELLE, les COULEURS, le STYLE, la COMPOSITION
3. Décris les ÉLÉMENTS VISUELS, l'ÉCLAIRAGE, la MISE EN PAGE
4. NE PAS inclure de texte spécifique (pas de "text:", "words:", etc.)
5. Pense "affiche publicitaire moderne, professionnelle et attractive"
6. Utilise des termes visuels précis: "gradient", "minimalist", "bold colors", "dynamic composition"

STYLE VISUEL À PRIVILÉGIER:
- Modern commercial photography
- Professional marketing material
- Clean and premium aesthetic
- High-end advertising design
- Vibrant but professional colors

FORMAT DE SORTIE (JSON uniquement):
{
  "visual_description": "Description visuelle détaillée et optimisée pour Stable Diffusion",
  "negative_prompt": "Éléments à éviter (blurry, low quality, text, watermark, etc.)"
}

EXEMPLES DE BONS PROMPTS:
- "Modern minimalist product advertisement, vibrant gradient background from coral to purple, professional studio lighting, clean composition, premium aesthetic, commercial photography style, 4k quality, sharp focus"
- "Dynamic promotional poster design, bold complementary colors, geometric shapes, professional marketing material, high-end commercial aesthetic, studio lighting, ultra detailed"
- "Sleek business flyer design, elegant color palette, modern typography layout suggestion through visual elements, professional photography, luxury brand aesthetic, pristine quality"
`,
      },
      {
        role: 'user',
        content: `Contexte: ${baseContext}\n\nCrée un prompt visuel pour un flyer marketing basé sur ce contexte.`,
      },
    ];

    try {
      const response = await this.chat(gptMessages);
      const parsed = JSON.parse(response.replace(/```json|```/g, '').trim());

      console.log(
        '[buildFlyerPrompt] Generated prompt:',
        parsed.visual_description,
      );
      return parsed.visual_description;
    } catch (e) {
      console.warn('[buildFlyerPrompt] GPT parse failed, using fallback');
      // Fallback: create a generic professional flyer prompt
      return `Professional marketing flyer design, modern minimalist aesthetic, vibrant gradient background, clean composition, commercial photography style, premium quality, studio lighting, 4k, ultra detailed, sharp focus`;
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                    FLYER IMAGE GENERATION (STABLE DIFFUSION)              */
  /* -------------------------------------------------------------------------- */
  async generateFlyer(
    params: any,
    userId?: number,
  ): Promise<{ url: string; imageData?: string; generationId?: number }> {
    console.log('--- START FLYER GENERATION (Stable Diffusion) ---');

    try {
      // 1. Build optimized prompt for flyer via GPT
      let flyerPrompt: string;

      try {
        flyerPrompt = await this.buildFlyerPrompt(params, userId);

        // Validate prompt is not empty
        if (!flyerPrompt || flyerPrompt.trim().length === 0) {
          console.warn(
            '[generateFlyer] Empty prompt from buildFlyerPrompt, using fallback',
          );
          flyerPrompt =
            'Professional marketing flyer design, modern aesthetic, vibrant colors, clean composition, commercial photography, 4k quality';
        }

        // Sanitize prompt (remove potential problematic characters)
        flyerPrompt = flyerPrompt.trim().substring(0, 1000); // Limit length
      } catch (promptError) {
        console.error('[generateFlyer] buildFlyerPrompt failed:', promptError);
        // Fallback to a safe default prompt
        flyerPrompt =
          'Professional marketing flyer design, modern minimalist aesthetic, vibrant gradient background, clean composition, commercial photography style, premium quality, studio lighting, 4k, ultra detailed, sharp focus';
      }

      console.log(
        '[generateFlyer] Using Stable Diffusion with prompt:',
        flyerPrompt,
      );

      // 2. Generate image using Stable Diffusion (same as generateImage)
      // Using 'realistic' style for professional marketing look
      const imageResult = await this.generateImage(
        { ...params, userQuery: flyerPrompt },
        'realistic',
        userId,
      );

      console.log(
        '[generateFlyer] Image generated successfully:',
        imageResult.url,
      );

      // 3. Return result (already saved by generateImage)
      return {
        url: imageResult.url,
        generationId: imageResult.generationId,
      };
    } catch (error) {
      console.error('--- FLYER GENERATION ERROR ---', error);
      throw error;
    }
  }

  /* -------------------------------------------------------------------------- */
  /*     OBSOLETE METHODS (Kept for reference - No longer used)                */
  /*     Flyer generation now uses Stable Diffusion instead of Puppeteer       */
  /* -------------------------------------------------------------------------- */

  private generateFlyerHTML(data: any): string {
    const { title, subtitle, mainPoints, cta, colors } = data;
    const bgColor = colors?.bg || '#1a1a2e';
    const primaryColor = colors?.primary || '#ff6b6b';
    const accentColor = colors?.accent || '#ffd93d';
    const textColor = colors?.text || '#ffffff';

    const pointsHTML = Array.isArray(mainPoints)
      ? mainPoints.map((point) => `<li>${point}</li>`).join('')
      : '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            width: 800px;
            height: 1000px;
            background: linear-gradient(135deg, ${bgColor} 0%, ${this.adjustColor(bgColor, -20)} 100%);
            font-family: 'Arial', sans-serif;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            padding: 40px;
            color: ${textColor};
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .title {
            font-size: 56px;
            font-weight: bold;
            color: ${primaryColor};
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            margin-bottom: 10px;
            line-height: 1.2;
          }
          .subtitle {
            font-size: 28px;
            color: ${accentColor};
            font-weight: 600;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
            line-height: 1.3;
          }
          .divider {
            width: 100%;
            height: 3px;
            background: linear-gradient(90deg, transparent, ${primaryColor}, transparent);
            margin: 30px 0;
          }
          .content {
            flex-grow: 1;
            text-align: center;
          }
          .points {
            list-style: none;
            font-size: 20px;
            line-height: 2;
            margin: 20px 0;
            color: ${textColor};
          }
          .points li {
            background: rgba(255,255,255,0.05);
            padding: 12px 20px;
            margin: 10px 0;
            border-left: 4px solid ${accentColor};
            border-radius: 4px;
            text-align: left;
          }
          .cta-button {
            background: linear-gradient(135deg, ${primaryColor}, ${this.adjustColor(primaryColor, -20)});
            color: ${textColor};
            padding: 20px 50px;
            font-size: 24px;
            font-weight: bold;
            border: none;
            border-radius: 50px;
            cursor: pointer;
            margin-top: auto;
            text-transform: uppercase;
            box-shadow: 0 8px 20px rgba(0,0,0,0.3);
            letter-spacing: 1px;
          }
          .footer {
            margin-top: 30px;
            font-size: 12px;
            opacity: 0.7;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">${this.escapeHTML(title)}</div>
          <div class="subtitle">${this.escapeHTML(subtitle)}</div>
        </div>
        <div class="divider"></div>
        <div class="content">
          ${pointsHTML ? `<ul class="points">${pointsHTML}</ul>` : ''}
        </div>
        <button class="cta-button">${this.escapeHTML(cta)}</button>
        <div class="footer">
          © Généré par Hipster IA
        </div>
      </body>
      </html>
    `;
  }

  private async generateFlyerFallback(data: any): Promise<Buffer> {
    // Fallback: Generate using PDFKit and convert to PNG (works without Puppeteer)
    const { title, subtitle, mainPoints, cta, colors } = data;
    const bgColor = colors?.bg || '#1a1a2e';
    const primaryColor = colors?.primary || '#ff6b6b';
    const accentColor = colors?.accent || '#ffd93d';

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: [800, 1000], margin: 0 });
        const chunks: Buffer[] = [];

        doc.on('data', chunks.push.bind(chunks));
        doc.on('end', async () => {
          const pdfBuffer = Buffer.concat(chunks);
          // For fallback, return a simple PNG-like placeholder
          // In production, you'd use pdf2image library here
          resolve(pdfBuffer);
        });
        doc.on('error', reject);

        // Simple PDF layout
        doc.rect(0, 0, 800, 1000).fill(bgColor);

        // Title
        doc.fillColor(primaryColor).fontSize(48).font('Helvetica-Bold');
        doc.text(title.substring(0, 50), 40, 100, {
          width: 720,
          align: 'center',
        });

        // Subtitle
        doc.fillColor(accentColor).fontSize(24).font('Helvetica');
        doc.text(subtitle.substring(0, 100), 40, 200, {
          width: 720,
          align: 'center',
        });

        // Points
        let y = 350;
        if (Array.isArray(mainPoints)) {
          for (const point of mainPoints.slice(0, 3)) {
            doc.fillColor('#ffffff').fontSize(16);
            doc.text(`• ${point.substring(0, 60)}`, 80, y, { width: 640 });
            y += 80;
          }
        }

        // CTA
        doc.fillColor(primaryColor).fontSize(32).font('Helvetica-Bold');
        doc.text(cta.substring(0, 30).toUpperCase(), 40, 850, {
          width: 720,
          align: 'center',
        });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private async renderHTMLToImage(html: string): Promise<Buffer> {
    let browser;
    try {
      const puppeteer = require('puppeteer');

      // Launch browser with error handling
      try {
        browser = await puppeteer.launch({
          headless: 'new',
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
      } catch (launchError) {
        console.error(
          'Failed to launch Puppeteer, trying with different args:',
          launchError,
        );
        // Try alternative launch options
        browser = await puppeteer.launch({
          headless: true,
          args: [
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
          ],
        });
      }

      const page = await browser.newPage();
      await page.setViewport({ width: 800, height: 1000 });

      // Set content with timeout
      await page.setContent(html, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      // Take screenshot
      const screenshot = await page.screenshot({ type: 'png', fullPage: true });
      await page.close();

      return screenshot;
    } catch (error) {
      console.error('Puppeteer rendering error:', error);
      // Don't throw - let the caller handle fallback
      throw new Error(
        `Puppeteer rendering failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  private adjustColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, Math.min(255, (num >> 16) + amt));
    const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
    const B = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));
    return (
      '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)
    );
  }

  private escapeHTML(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /*                         POSTER GENERATION (NATIVE)                         */
  /* -------------------------------------------------------------------------- */
  async generatePoster(
    params: any,
    userId?: number,
  ): Promise<{ backgroundUrl: string; layout: any; generationId?: number }> {
    // Backward compatibility
    if (typeof params === 'string') {
      params = { userQuery: params };
    }

    const baseContext = await this.buildPrompt(params, userId);
    console.log('--- GENERATE POSTER (Native) ---');

    // 1. Generate Layout Data (JSON)
    const layoutPrompt = `
      Génère une structure JSON pour une affiche publicitaire professionnelle basée sur :
      ${baseContext}
      
      RÈGLES COMPOSITION :
      - TITRE : Court, accrocheur (ex: "PROMO RENTRÉE", "NOUVEAU MENU").
      - SOUS-TITRE : Description en 1 phrase.
      - LISTE : Liste des produits/services avec prix (SI mentionnés).
      - CTA : Appel à l'action (ex: "Réservez au 06...").
      - COULEURS : Palette hexadécimale (text, accent) adaptée au sujet.
      
      IMPORTANT :
      - N'invente AUCUN PRIX non fourni.
      - FORMAT JSON STRICT :
      {
        "title": "Titre",
        "subtitle": "Sous-titre",
        "items": [ { "label": "Produit", "price": "10€" } ],
        "cta": "Contact...",
        "colors": { "text": "#000000", "accent": "#FF0000" }
      }
    `;

    let layoutData;
    try {
      // Direct prompt without excessive wrapper to save tokens/complexity, since we just need JSON
      const layoutJson = await this.chat([
        {
          role: 'system',
          content:
            'Tu es un designer expert. Réponds uniquement en JSON valide.',
        },
        { role: 'user', content: layoutPrompt },
      ]);
      layoutData = JSON.parse(
        layoutJson.replace(/```json/g, '').replace(/```/g, ''),
      );
    } catch (e) {
      console.error('Layout generation failed', e);
      layoutData = {
        title: 'Affiche',
        subtitle: params.userQuery || 'Affiche',
        items: [],
        cta: '',
        colors: { text: '#000', accent: '#000' },
      };
    }

    // 2. Generate Background Image (No Text)
    const bgPrompt = `
      Professional advertising background for: ${params.userQuery || 'Marketing'}. 
      Style: Minimalist, abstract, high quality 4k texture. 
      IMPORTANT: NO TEXT, NO LETTERS, NO WORDS on the image. Just background, negative space in center for text overlay.
      Soft lighting, professional gradient or texture.
    `;

    // Allow generateImage to handle DALL-E call
    const { url: bgUrl, generationId } = await this.generateImage(
      { ...params, userQuery: bgPrompt },
      'realistic',
      userId,
    );

    return { backgroundUrl: bgUrl, layout: layoutData, generationId };
  }

  async exportPoster(data: {
    backgroundUrl: string;
    layout: any;
    model?: string;
  }): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: [1024, 1024], margin: 0 });
        const buffers: Buffer[] = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        // Draw Background
        const response = await fetch(data.backgroundUrl);
        const arrayBuffer = await response.arrayBuffer();
        const bgBuffer = Buffer.from(arrayBuffer);

        doc.image(bgBuffer, 0, 0, { width: 1024, height: 1024 });

        // Add minimal Overlay for readability
        doc.rect(0, 0, 1024, 1024).fillOpacity(0.3).fill('black');
        doc.fillOpacity(1); // Reset opcode

        // Draw Text using Layout
        const { title, subtitle, items, cta, colors } = data.layout;
        const textColor = colors?.text || '#ffffff';
        const accentColor = colors?.accent || '#ff0000';
        const model = data.model || 'Moderne';

        if (model === 'Minimaliste') {
          doc
            .fillColor(textColor)
            .fontSize(100)
            .font('Helvetica-Bold')
            .text(title || '', 50, 400, { align: 'left', width: 900 });
          doc
            .fontSize(30)
            .font('Helvetica-Oblique')
            .text(subtitle || '', 50, 520, { align: 'left', width: 900 });

          let y = 600;
          items?.forEach((item: any) => {
            doc
              .fontSize(40)
              .font('Helvetica')
              .fillColor('#FFFFFF')
              .text(`${item.label}   `, 50, y, { continued: true });
            doc.font('Helvetica-Bold').text(item.price);
            y += 60;
          });

          doc.moveDown();
          doc
            .fontSize(35)
            .font('Helvetica')
            .fillColor(accentColor)
            .text(cta || '', 50, y + 50, { underline: true });
        } else if (model === 'Luxe') {
          // Border
          doc
            .rect(40, 40, 944, 944)
            .strokeColor('#D4AF37')
            .lineWidth(5)
            .stroke();

          doc
            .fillColor('#D4AF37')
            .fontSize(24)
            .font('Times-Roman')
            .text('PREMIUM COLLECTION', 0, 300, {
              align: 'center',
              characterSpacing: 5,
            });
          doc
            .fillColor(textColor)
            .fontSize(90)
            .font('Times-Roman')
            .text(title || '', 0, 350, { align: 'center' });

          // Divider
          doc
            .moveTo(462, 480)
            .lineTo(562, 480)
            .strokeColor('#D4AF37')
            .lineWidth(2)
            .stroke();

          let y = 520;
          items?.forEach((item: any) => {
            doc
              .fillColor(textColor)
              .fontSize(36)
              .font('Times-Roman')
              .text(item.label, 0, y, { align: 'center' });
            doc
              .fillColor('#D4AF37')
              .fontSize(32)
              .text(item.price, 0, y + 40, { align: 'center' });
            y += 100;
          });

          doc
            .fillColor('#D4AF37')
            .fontSize(24)
            .text(cta || '', 0, 900, { align: 'center', characterSpacing: 2 });
          doc.fontSize(18).text('MERCIA • PARIS', 0, 940, { align: 'center' });
        } else if (model === 'Flashy') {
          doc.save();
          doc.rotate(-5, { origin: [512, 512] });
          doc
            .fillColor('#FFFF00')
            .fontSize(110)
            .font('Helvetica-Bold')
            .text((title || '').toUpperCase(), 0, 200, { align: 'center' });
          doc.restore();

          doc.save();
          doc.rotate(2, { origin: [512, 600] });
          // Bg for items
          doc.rect(200, 500, 624, 300).fillOpacity(0.7).fill('black');
          doc.fillOpacity(1);

          let y = 550;
          items?.forEach((item: any) => {
            doc
              .fillColor('#FFFF00')
              .fontSize(50)
              .font('Helvetica-Bold')
              .text(`${item.label} : ${item.price}`, 0, y, { align: 'center' });
            y += 70;
          });
          doc.restore();

          // CTA Badge
          doc.rect(312, 900, 400, 80).fill('#FFFF00');
          doc
            .fillColor('#000000')
            .fontSize(40)
            .font('Helvetica-Bold')
            .text(cta || '', 312, 920, { align: 'center', width: 400 });
        } else {
          // MODERNE (Default)
          doc
            .fillColor(textColor)
            .fontSize(80)
            .font('Helvetica-Bold')
            .text(title || '', 0, 150, { align: 'center', width: 1024 });

          // Subtitle
          doc
            .fillColor(textColor)
            .fontSize(40)
            .font('Helvetica')
            .text(subtitle || '', 100, 250, { align: 'center', width: 824 });

          // Items
          let y = 400;
          if (items && Array.isArray(items)) {
            items.forEach((item: any) => {
              doc
                .fillColor(textColor)
                .fontSize(35)
                .text(item.label || '', 150, y);
              if (item.price) {
                doc
                  .fillColor(accentColor)
                  .text(item.price, 800, y, { align: 'right', width: 100 });
              }
              y += 60;
            });
          }

          // CTA
          doc
            .fillColor(accentColor)
            .fontSize(50)
            .font('Helvetica-Bold')
            .text(cta || '', 0, 900, { align: 'center', width: 1024 });
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}
