import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { AiService } from './ai.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('AI')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @ApiOperation({ summary: 'Chat avec l\'IA (GPT-5)' })
  @Post('chat')
  @Roles(Role.AI_USER)
  async chat(@Body() body: { messages: any[] }) {
    return {
      message: await this.aiService.chat(body.messages),
    };
  }

  @ApiOperation({ summary: 'Générer du texte via IA' })
  @ResponseMessage('Texte généré avec succès')
  @Post('text')
  @Roles(Role.AI_USER)
  async generateText(
    @Body() body: { prompt: string; type: 'blog' | 'social' | 'ad' },
  ) {
    return {
      content: await this.aiService.generateText(body.prompt, body.type),
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
    const imageUrl = await this.aiService.generateImage(
      body.prompt,
      body.style,
    );

    // AI isolation: we don't fetch roles from standard user.
    // We check the AI subscription profile linked to this AI account.
    // Fetch user with profile to check planType
    const aiUser = await this.aiService.getAiUserWithProfile(req.user.sub);
    const isPremium =
      aiUser?.aiProfile?.planType === 'pro' ||
      aiUser?.aiProfile?.planType === 'enterprise';

    return { url: await this.aiService.applyWatermark(imageUrl, isPremium) };
  }

  @ApiOperation({ summary: 'Générer un document via IA' })
  @ResponseMessage('Document généré avec succès')
  @Post('document')
  @Roles(Role.AI_USER)
  async generateDocument(
    @Body() body: { type: 'legal' | 'business'; params: any },
  ) {
    return {
      content: await this.aiService.generateDocument(body.type, body.params),
    };
  }
}
