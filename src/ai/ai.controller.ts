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
} from '@nestjs/common';
import { AiService } from './ai.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';

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
    return this.aiService.getHistory(req.user.sub);
  }

  @ApiOperation({ summary: "Chat avec l'IA (GPT-5)" })
  @Post('chat')
  @Roles(Role.AI_USER)
  async chat(@Body() body: { messages: any[] }, @Req() req) {
    return {
      message: await this.aiService.chat(body.messages, req.user.sub),
    };
  }

  @ApiOperation({ summary: 'Générer du texte via IA' })
  @ResponseMessage('Texte généré avec succès')
  @Post('text')
  @Roles(Role.AI_USER)
  async generateText(
    @Body() body: { prompt: string; type: 'blog' | 'social' | 'ad' },
    @Req() req,
  ) {
    const result = await this.aiService.generateText(
      body.prompt,
      body.type,
      req.user.sub,
    );
    return {
      content: result.content,
      generationId: result.generationId,
    };
  }

  @ApiOperation({ summary: 'Générer une image via IA' })
  @ResponseMessage('Image générée avec succès')
  @Post('image')
  @Roles(Role.AI_USER)
  async generateImage(
    @Body() body: { prompt: string; style: 'realistic' | 'cartoon' | 'sketch' },
    @Req() req,
  ) {
    // AI isolation: we don't fetch roles from standard user.
    // We check the AI subscription profile linked to this AI account.
    // Fetch user with profile to check planType
    const aiUser = await this.aiService.getAiUserWithProfile(req.user.sub);
    const isPremium =
      aiUser?.aiProfile?.planType === 'pro' ||
      aiUser?.aiProfile?.planType === 'enterprise';

    const result = await this.aiService.generateImage(
      body.prompt,
      body.style,
      req.user.sub,
    );
    return {
      url: await this.aiService.applyWatermark(result.url, isPremium),
      rawUrl: result.url,
      generationId: result.generationId,
    };
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
}
