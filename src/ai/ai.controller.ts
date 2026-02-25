import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  ForbiddenException,
  Logger,
  Get,
  Param,
  Query,
  Res,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiService } from './ai.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PlanType } from './entities/ai-user.entity';

@ApiTags('AI')
@Controller('ai')
@UseGuards(RolesGuard)
@ApiBearerAuth()
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(private readonly aiService: AiService) {
    this.logger.log('AiController initialized');
  }

  @ApiOperation({ summary: 'Récupérer mon profil AI' })
  @Get('me')
  @Roles(Role.AI_USER)
  async getMe(@Req() req) {
    return this.aiService.getAiUserWithProfile(req.user.sub);
  }

  @Public()
  @Get('ping')
  async ping() {
    return { status: 'ok', message: 'AiController is reachable (GET)' };
  }

  @Public()
  @Post('ping')
  async postPing(@Body() body: any) {
    this.logger.log('[AiController] POST ping received with body:', body);
    return { status: 'ok', message: 'AiController is reachable (POST)', body };
  }

  // DOIT ETRE VISIBLE PAR TOUS
  @ApiOperation({ summary: 'Récupérer mon historique AI' })
  @Get('history')
  @Roles(Role.AI_USER)
  async getHistory(@Req() req) {
    console.log('[AiController] GET /history called by user:', req.user.sub);
    const history = await this.aiService.getHistory(req.user.sub);
    console.log(
      '[AiController] Returning history with',
      history?.length,
      'items',
    );
    return history;
  }

  @ApiOperation({ summary: 'Récupérer mon historique groupé par conversation' })
  @Get('conversations')
  @Roles(Role.AI_USER)
  async getGroupedConversations(@Req() req) {
    console.log(
      '[AiController] GET /conversations called by user:',
      req.user.sub,
    );
    const conversations = await this.aiService.getGroupedConversations(
      req.user.sub,
    );
    console.log(
      '[AiController] Returning',
      conversations?.length,
      'conversations',
    );
    return conversations;
  }

  @ApiOperation({ summary: 'Récupérer une conversation spécifique' })
  @Get('history/:id')
  @Roles(Role.AI_USER)
  async getConversation(@Param('id') id: string, @Req() req) {
    // Support UUID (contains '-'), numeric id, or legacy standalone_XXX
    let idOrConvId: number | string = id;
    if (id.startsWith('standalone_')) {
      const numId = parseInt(id.replace('standalone_', ''), 10);
      if (isNaN(numId)) throw new BadRequestException('ID invalide');
      idOrConvId = numId;
    } else if (!id.includes('-') && !isNaN(parseInt(id, 10))) {
      idOrConvId = parseInt(id, 10);
    }
    return this.aiService.getConversation(idOrConvId, req.user.sub);
  }

  @ApiOperation({ summary: "Supprimer un item d'historique" })
  @Post('history/:id/delete') // Using POST for broader compatibility if needed, but DELETE is better REST
  @Roles(Role.AI_USER)
  async deleteHistoryItem(@Param('id') id: string, @Req() req) {
    console.log(
      `[AiController] POST /history/${id}/delete - User: ${req.user.sub}`,
    );

    // Support UUID, numeric id, or legacy standalone_XXX
    let idToDelete: number | string = id;
    if (id.startsWith('standalone_')) {
      const numId = parseInt(id.replace('standalone_', ''), 10);
      if (isNaN(numId)) {
        console.error(`[AiController] Invalid standalone ID format: ${id}`);
        throw new BadRequestException('ID invalide');
      }
      idToDelete = numId;
    } else if (!id.includes('-') && !isNaN(parseInt(id, 10))) {
      idToDelete = parseInt(id, 10);
    }

    console.log(
      `[AiController] Calling AiService.deleteGeneration with ID: ${idToDelete}`,
    );
    const result = await this.aiService.deleteGeneration(
      idToDelete,
      req.user.sub,
    );
    console.log(`[AiController] AiService.deleteGeneration result:`, result);

    return result;
  }

  @ApiOperation({ summary: "Effacer tout l'historique" })
  @Post('history/clear')
  @Roles(Role.AI_USER)
  async clearHistory(@Req() req) {
    console.log(`[AiController] POST /history/clear - User: ${req.user.sub}`);
    const result = await this.aiService.clearHistory(req.user.sub);
    console.log(`[AiController] AiService.clearHistory result:`, result);
    return result;
  }

  @ApiOperation({ summary: "Chat avec l'IA (GPT-5)" })
  @Post('chat')
  @Roles(Role.AI_USER)
  @UseInterceptors(FileInterceptor('file')) // Match frontend field name
  async chat(
    @Body() body: { messages: any; conversationId?: string },
    @Req() req,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let messages = body.messages;
    if (typeof messages === 'string') {
      try {
        messages = JSON.parse(messages);
      } catch (e) {
        throw new BadRequestException('Invalid messages JSON');
      }
    }

    const result = await this.aiService.chat(
      messages,
      req.user.sub,
      body.conversationId,
      file,
    );
    return { data: result };
  }

  @ApiOperation({ summary: 'Transcrire un fichier audio (Whisper)' })
  @Post('transcribe')
  @Roles(Role.AI_USER)
  @UseInterceptors(FileInterceptor('file'))
  async transcribeAudio(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Aucun fichier audio fourni');
    const text = await this.aiService.transcribeAudio(file);
    return { text };
  }

  @ApiOperation({ summary: 'Générer du texte via IA' })
  @ResponseMessage('Texte généré avec succès')
  @Post('text')
  @Roles(Role.AI_USER)
  async generateText(
    @Body()
    body: {
      params: any;
      type: 'blog' | 'social' | 'ad' | 'text' | 'texte' | 'seo' | 'email';
    },
    @Req() req,
  ) {
    try {
      console.log('--- API POST /ai/text ---', JSON.stringify(body, null, 2));
      const result = await this.aiService.generateText(
        body.params,
        body.type,
        req.user.sub,
      );
      return {
        content: result.content,
        generationId: result.generationId,
      };
    } catch (error: any) {
      this.logger.error('Text generation error:', error);
      if (error instanceof BadRequestException) throw error;
      throw new HttpException(
        {
          message:
            error?.message || 'Erreur interne lors de la génération de texte',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Refiner un text (Amélioration simple)' })
  @Post('refine-text')
  @Roles(Role.AI_USER)
  async refineText(@Body() body: { text: string }, @Req() req) {
    const refined = await this.aiService.refineText(body.text);
    return { refined };
  }

  @ApiOperation({ summary: 'Générer une image via IA' })
  @ResponseMessage('Image générée avec succès')
  @Post('image')
  @Roles(Role.AI_USER)
  @UseInterceptors(FileInterceptor('image'))
  async generateImage(
    @Body()
    body: {
      params: any;
      style: 'Premium' | 'Hero Studio' | 'Minimal Studio' | 'None';
      seed?: number;
    },
    @Req() req,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    try {
      let params = body.params;
      if (typeof params === 'string') {
        try {
          params = JSON.parse(params);
        } catch (e) {
          throw new BadRequestException('Invalid params JSON');
        }
      }

      console.log(
        '[AiController] generateImage - file present:',
        !!file,
        'filename:',
        file?.originalname,
      );
      console.log('--- API POST /ai/image ---', {
        ...body,
        params,
        hasFile: !!file,
        seed: body.seed,
      });

      const aiUser = await this.aiService.getAiUserWithProfile(req.user.sub);
      const isPremium = aiUser?.planType !== PlanType.CURIEUX;

      const result = await this.aiService.generateImage(
        params,
        body.style,
        req.user.sub,
        file,
        body.seed,
      );
      return {
        url: await this.aiService.applyWatermark(result.url, isPremium),
        rawUrl: result.url,
        generationId: result.generationId,
        seed: result.seed,
      };
    } catch (error: any) {
      this.logger.error('Image generation error:', error);
      if (error instanceof BadRequestException) throw error;
      throw new HttpException(
        {
          message:
            error?.message || "Erreur interne lors de la génération d'image",
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({
    summary: 'Régénérer une image basée sur une génération précédente',
  })
  @ResponseMessage('Image régénérée avec succès')
  @Post('regenerate')
  @Roles(Role.AI_USER)
  async regenerate(
    @Body() body: { generationId: number; seed?: number },
    @Req() req,
  ) {
    try {
      const aiUser = await this.aiService.getAiUserWithProfile(req.user.sub);
      const isPremium = aiUser?.planType !== PlanType.CURIEUX;

      const result = await this.aiService.regenerateFromGeneration(
        body.generationId,
        req.user.sub,
        body.seed,
      );

      return {
        url: await this.aiService.applyWatermark(result.url, isPremium),
        rawUrl: result.url,
        generationId: result.generationId,
        seed: result.seed,
      };
    } catch (error: any) {
      this.logger.error('Regenerate error:', error);
      throw new HttpException(
        { message: error?.message || 'Erreur lors de la régénération' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Générer un document via IA' })
  @ResponseMessage('Document généré avec succès')
  @Post('document')
  @Roles(Role.AI_USER)
  async generateDocument(
    @Body() body: { type: 'legal' | 'business'; params: any },
    @Req() req,
  ) {
    return await this.aiService.generateDocument(
      body.type,
      body.params,
      req.user.sub,
    );
  }

  @ApiOperation({ summary: 'Générer un post réseaux sociaux (Image + Texte)' })
  @ResponseMessage('Post généré succès')
  @Post('social')
  @Roles(Role.AI_USER)
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  async generateSocial(
    @Body() body: { params: any; seed?: number },
    @Req() req,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    try {
      let params = body.params;
      if (typeof params === 'string') {
        try {
          params = JSON.parse(params);
        } catch (e) {
          throw new BadRequestException('Invalid params JSON');
        }
      }

      console.log(
        '[AiController] generateSocial - headers:',
        JSON.stringify(req.headers, null, 2),
      );
      console.log(
        '[AiController] generateSocial - body size (approx):',
        JSON.stringify(body).length,
      );
      console.log(
        '[AiController] generateSocial - file:',
        file ? `${file.originalname} (${file.size} bytes)` : 'NOT PRESENT',
      );

      console.log('--- API POST /ai/social ---', {
        params,
        userId: req.user.sub,
        hasFile: !!file,
        seed: body.seed,
      });
      const result = await this.aiService.generateSocial(
        params,
        req.user.sub,
        file,
        body.seed,
      );
      console.log('--- API SOCIAL RESULT SUCCESS ---');
      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      console.error('[AiController] generateSocial CRASHED:', error);
      console.error('[AiController] Error details:', {
        message: error.message,
        stack: error.stack,
        body: JSON.stringify(body).substring(0, 500),
      });
      if (error instanceof BadRequestException) throw error;
      throw new HttpException(
        {
          message:
            error?.message || 'Erreur interne lors de la génération social',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Exporter un document (PDF, Word, Excel)' })
  @Get('export/:id')
  @Roles(Role.AI_USER)
  async exportDocument(
    @Req() req,
    @Param('id') id: string,
    @Query('format') format: string,
    @Query('model') model: string,
    @Res() res,
  ) {
    try {
      const { buffer, fileName, mimeType } =
        await this.aiService.exportDocument(
          parseInt(id),
          format,
          req.user.sub,
          model,
        );

      res.set({
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': buffer.length,
      });

      res.end(buffer);
    } catch (error) {
      this.logger.error('Export error:', error);
      res.status(500).json({ message: "Erreur lors de l'exportation" });
    }
  }

  @ApiOperation({ summary: 'Générer un flyer en image (PNG)' })
  @ResponseMessage('Image de flyer générée avec succès')
  @Post('flyer')
  @Roles(Role.AI_USER)
  @UseInterceptors(FileInterceptor('image'))
  async generateFlyer(
    @Body() body: { params: any; seed?: number },
    @Req() req,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    try {
      let params = body.params;
      if (typeof params === 'string') {
        try {
          params = JSON.parse(params);
        } catch (e) {
          throw new BadRequestException('Invalid params JSON');
        }
      }

      console.log('[AiController] generateFlyer - file present:', !!file);
      console.log('--- API POST /ai/flyer ---', {
        params,
        hasFile: !!file,
        seed: body.seed,
      });
      const result = await this.aiService.generateFlyer(
        params,
        req.user.sub,
        file,
        body.seed,
      );
      console.log('--- FLYER GENERATION SUCCESS ---');
      return {
        url: result.url,
        imageData: result.url,
        generationId: result.generationId,
        seed: result.seed,
      };
    } catch (error: any) {
      this.logger.error('Flyer generation error:', error);
      throw new HttpException(
        {
          message:
            error?.message || 'Erreur interne lors de la génération de flyer',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @ApiOperation({ summary: 'Générer une vidéo via IA' })
  @Post('video')
  @Roles(Role.AI_USER)
  async generateVideo(
    @Body() body: { params: any; seed?: number },
    @Req() req,
  ) {
    const result = await this.aiService.generateVideo(
      body.params,
      req.user.sub,
      body.seed,
    );
    return { data: result };
  }

  @ApiOperation({ summary: 'Générer un son/audio via IA' })
  @Post('audio')
  @Roles(Role.AI_USER)
  async generateAudio(
    @Body() body: { params: any; seed?: number },
    @Req() req,
  ) {
    const result = await this.aiService.generateAudio(
      body.params,
      req.user.sub,
      body.seed,
    );
    return { data: result };
  }
}
