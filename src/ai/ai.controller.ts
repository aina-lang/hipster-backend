import { Controller, Post, Body, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { AiService } from './ai.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('AI')
@Controller('ai')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AiController {
  constructor(private readonly aiService: AiService) { }

  @ApiOperation({ summary: 'Générer du texte via IA' })
  @ResponseMessage('Texte généré avec succès')
  @Post('text')
  @Roles(Role.CLIENT_MARKETING, Role.EMPLOYEE)
  async generateText(@Body() body: { prompt: string; type: 'blog' | 'social' | 'ad' }) {
    return { content: await this.aiService.generateText(body.prompt, body.type) };
  }

  @ApiOperation({ summary: 'Générer une image via IA' })
  @ResponseMessage('Image générée avec succès')
  @Post('image')
  @Roles(Role.CLIENT_MARKETING, Role.EMPLOYEE)
  async generateImage(@Body() body: { prompt: string; style: 'realistic' | 'cartoon' | 'sketch' }, @Req() req) {
    const user = req.user;
    // Check subscription status here if needed, or rely on guards
    const imageUrl = await this.aiService.generateImage(body.prompt, body.style);
    // Mock subscription check for watermark
    const isPremium = user.roles.includes(Role.ADMIN) || user.roles.includes(Role.EMPLOYEE);
    return { url: await this.aiService.applyWatermark(imageUrl, isPremium) };
  }

  @ApiOperation({ summary: 'Générer un document via IA' })
  @ResponseMessage('Document généré avec succès')
  @Post('document')
  @Roles(Role.CLIENT_MARKETING, Role.EMPLOYEE)
  async generateDocument(@Body() body: { type: 'legal' | 'business'; params: any }) {
    return { content: await this.aiService.generateDocument(body.type, body.params) };
  }
}
