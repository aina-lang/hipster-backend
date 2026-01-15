import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiUser } from './entities/ai-user.entity';
import {
  AiGeneration,
  AiGenerationType,
} from './entities/ai-generation.entity';

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

    const workflowDetails = workflowAnswers
      ? Object.entries(workflowAnswers)
          .map(([k, v]) => `• ${k}: ${v}`)
          .join('\n')
      : '';

    const parts = [
      `Métier: ${job || 'Non spécifié'}`,
      `Type de contenu: ${cleanFunction}`,
      workflowDetails ? `Détails de personnalisation:\n${workflowDetails}` : '',
      context ? `Contexte supplémentaire: ${context}` : '',
      userQuery ? `Demande spécifique de l'utilisateur: ${userQuery}` : '',
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

    const messages = [
      {
        role: 'system',
        content: `Tu es Hipster IA. Voici ta configuration :\n${systemContext}\n\n${
          type === 'social'
            ? "Réponds avec un format clair et structuré (pas de JSON). IMPORTANT: N'utilise JAMAIS de mise en forme Markdown comme les doubles astérisques (**) pour le gras. Produis du texte brut et propre."
            : 'Réponds au format JSON si possible pour une meilleure extraction des données, sinon utilise un format clair et structuré. IMPORTANT: Pas de mise en forme Markdown (**) dans les valeurs textuelles.'
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
      });
      generationId = saved.id;
    }

    return { content: result, generationId };
  }

  async generateImage(
    params: any,
    style: 'realistic' | 'cartoon' | 'sketch',
    userId?: number,
  ): Promise<{ url: string; generationId?: number }> {
    // Backward compatibility
    if (typeof params === 'string') {
      params = { userQuery: params };
    }

    const basePrompt = await this.buildPrompt(params, userId);
    console.log(`--- GENERATE IMAGE (DALL-E 3) ---`);
    console.log(`Base Prompt: ${basePrompt}`);

    let brandingInfo = '';
    if (userId) {
      const userObj = await this.getAiUserWithProfile(userId);
      if (userObj?.aiProfile) {
        brandingInfo = `for ${userObj.aiProfile.companyName || userObj.firstName || 'a professional business'}.`;
      }
    }

    // QUALITY BOOSTER: Positive constraints to simulate negative prompts
    const qualityBooster =
      ' . Create a clean and modern typography poster. Text must be perfectly readable, sharp, not blurry, not distorted and not stylized. Use high contrast, straight lines, and consistent font weight. Do not warp letters. Do not add extra text. Use a centered professional layout. High Resolution, 4K, Vector Style.';

    /* -------------------------------------------------------------------------- */
    /*                         SMART PROMPT REFINEMENT (GPT)                      */
    /* -------------------------------------------------------------------------- */
    // Use GPT to structure the prompt and define EXACT text to avoid hallucinations/typos
    let smartPrompt = params.userQuery || '';
    try {
      const gptMessages = [
        {
          role: 'system',
          content: `Tu es un Directeur Artistique expert en marketing. Ta mission est de préparer un prompt PARFAIT pour DALL-E 3.
          
          RÈGLES CRITIQUES :
          1. ANALYSE : Identifie le sujet visuel principal et le style.
          2. TEXTE : Définis le texte EXACT qui doit apparaître sur l'image. 
             - Si l'utilisateur fournit un texte, utilise-le tel quel.
             - Sinon, crée un slogan court et percutant (max 5 mots).
             - VERROUILLE L'ORTHOGRAPHE.
             - N'INVENTE PAS de prix ou services non mentionnés.
          3. BRANDING : Si pertinent (ex: affiche promo), inclus les infos de contact fournies (numéro, site) dans le texte de l'image.
             Infos client : ${brandingInfo}
          
          FORMAT DE RÉPONSE (JSON uniquement) :
          {
            "visual_description": "Description détaillée de la scène en anglais pour DALL-E...",
            "exact_text_to_display": "Le texte exact à écrire sur l'image"
          }`,
        },
        { role: 'user', content: `Sujet : ${smartPrompt}. Style : ${style}` },
      ];

      const gptResponse = await this.chat(gptMessages);
      const parsed = JSON.parse(
        gptResponse.replace(/```json/g, '').replace(/```/g, ''),
      );

      if (parsed.visual_description && parsed.exact_text_to_display) {
        smartPrompt = `${parsed.visual_description}. 
        IMPORTANT - The image MUST display this exact text clearly: "${parsed.exact_text_to_display}". 
        Typography must be professional, bold, and perfectly spelled.`;
      }
    } catch (e) {
      console.log(
        'Smart prompt extraction failed, falling back to raw prompt',
        e,
      );
    }

    let enhancedPrompt = `${smartPrompt} ${qualityBooster}`;
    let dalleStyle: 'vivid' | 'natural' = 'vivid';

    if (style === 'cartoon') {
      enhancedPrompt += ' . Style: Cartoon, vibrant colors, flat design.';
      dalleStyle = 'vivid';
    } else if (style === 'sketch') {
      enhancedPrompt += ' . Style: Pencil sketch, artistic, black and white.';
      dalleStyle = 'natural';
    } else {
      // realistic
      enhancedPrompt +=
        ' . Style: Photorealistic, high quality, 4k, professional photography.';
      dalleStyle = 'natural';
    }

    try {
      const response = await this.openai.images.generate({
        model: 'dall-e-3',
        prompt: enhancedPrompt,
        n: 1,
        size: '1024x1024',
        quality: 'hd', // Boost quality to HD
        style: dalleStyle,
        response_format: 'url',
      });

      const url = response.data[0].url;
      console.log('--- IMAGE GENERATED ---');
      console.log('URL:', url);

      let generationId: number | undefined;
      if (userId && url) {
        const saved = await this.aiGenRepo.save({
          user: { id: userId } as AiUser,
          type: AiGenerationType.IMAGE,
          prompt: basePrompt.substring(0, 1000),
          result: url,
          title:
            (params.userQuery || 'Image sans titre').substring(0, 30) + '...',
        });
        generationId = saved.id;
      }
      return { url, generationId };
    } catch (error) {
      console.error('--- OPENAI IMAGE ERROR ---');
      console.error(error);
      throw new Error("Erreur lors de la génération d'image");
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
        : `${this.configService.get('API_URL') || 'http://localhost:3000'}${branding.logoUrl}`
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

  /* -------------------------------------------------------------------------- */
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
