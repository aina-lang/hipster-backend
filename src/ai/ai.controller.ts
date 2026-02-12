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
    return { status: 'ok', message: 'AiController is reachable' };
  }

  // DOIT ETRE VISIBLE PAR TOUS
  @ApiOperation({ summary: 'Récupérer mon historique AI' })
  @Get('history')
  @Roles(Role.AI_USER)
  async getHistory(@Req() req) {
    console.log('[AiController] GET /history called by user:', req.user.sub);
    return this.aiService.getHistory(req.user.sub);
  }

  @ApiOperation({ summary: 'Récupérer une conversation spécifique' })
  @Get('history/:id')
  @Roles(Role.AI_USER)
  async getConversation(@Param('id') id: string, @Req() req) {
    return this.aiService.getConversation(parseInt(id), req.user.sub);
  }

  @ApiOperation({ summary: "Supprimer un item d'historique" })
  @Post('history/:id/delete') // Using POST for broader compatibility if needed, but DELETE is better REST
  @Roles(Role.AI_USER)
  async deleteHistoryItem(@Param('id') id: string, @Req() req) {
    await this.aiService.deleteGeneration(parseInt(id), req.user.sub);
    return { message: 'Item deleted' };
  }

  @ApiOperation({ summary: "Effacer tout l'historique" })
  @Post('history/clear')
  @Roles(Role.AI_USER)
  async clearHistory(@Req() req) {
    await this.aiService.clearHistory(req.user.sub);
    return { message: 'History cleared' };
  }

  @ApiOperation({ summary: "Chat avec l'IA (GPT-5)" })
  @Post('chat')
  @Roles(Role.AI_USER)
  async chat(
    @Body() body: { messages: any[]; conversationId?: string },
    @Req() req,
  ) {
    const result = await this.aiService.chat(
      body.messages,
      req.user.sub,
      body.conversationId,
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
    body: { params: any; type: 'blog' | 'social' | 'ad' | 'text' | 'texte' },
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

  @ApiOperation({ summary: 'Générer une image via IA' })
  @ResponseMessage('Image générée avec succès')
  @Post('image')
  @Roles(Role.AI_USER)
  async generateImage(
    @Body()
    body: {
      params: any;
      style: 'Monochrome' | 'Hero Studio' | 'Minimal Studio';
    },
    @Req() req,
  ) {
    try {
      console.log('--- API POST /ai/image ---', JSON.stringify(body, null, 2));
      // AI isolation: we don't fetch roles from standard user.
      // We check the AI subscription profile linked to this AI account.
      // Fetch user with profile to check planType
      const aiUser = await this.aiService.getAiUserWithProfile(req.user.sub);
      const isPremium = aiUser?.planType !== PlanType.CURIEUX;

      const result = await this.aiService.generateImage(
        body.params,
        body.style,
        req.user.sub,
      );
      return {
        url: await this.aiService.applyWatermark(result.url, isPremium),
        rawUrl: result.url,
        generationId: result.generationId,
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
  @ResponseMessage('Post généré avec succès')
  @Post('social')
  @Roles(Role.AI_USER)
  async generateSocial(@Body() body: { params: any }, @Req() req) {
    try {
      console.log('--- API POST /ai/social ---', JSON.stringify(body, null, 2));
      const result = await this.aiService.generateSocial(
        body.params,
        req.user.sub,
      );
      console.log('--- API SOCIAL RESULT SUCCESS ---');
      return result;
    } catch (error: any) {
      this.logger.error('Social generation error:', error);
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
  async generateFlyer(@Body() body: { params: any }, @Req() req) {
    try {
      console.log('--- API POST /ai/flyer ---', JSON.stringify(body, null, 2));
      const result = await this.aiService.generateFlyer(
        body.params,
        req.user.sub,
      );
      console.log('--- FLYER GENERATION SUCCESS ---');
      return {
        url: result.url,
        imageData: result.imageData,
        generationId: result.generationId,
      };
    } catch (error: any) {
      this.logger.error('Flyer generation error:', error);
      if (error instanceof BadRequestException) throw error;
      throw new HttpException(
        {
          message:
            error?.message || 'Erreur interne lors de la génération de flyer',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
