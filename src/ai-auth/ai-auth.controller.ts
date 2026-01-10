import { Controller, Post, Body } from '@nestjs/common';
import { AiAuthService } from './ai-auth.service';
import { Public } from 'src/common/decorators/public.decorator';
import { ApiOperation, ApiTags, ApiBody } from '@nestjs/swagger';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';

@ApiTags('AI-Auth')
@Controller('ai/auth')
export class AiAuthController {
  constructor(private readonly aiAuthService: AiAuthService) {}

  @Public()
  @ApiOperation({ summary: "Inscription d'un utilisateur IA" })
  @ResponseMessage('Utilisateur IA inscrit avec succès')
  @Post('register')
  async register(@Body() dto: any) {
    return this.aiAuthService.register(dto);
  }

  @Public()
  @ApiOperation({ summary: 'Connexion utilisateur IA' })
  @ResponseMessage('Connexion IA réussie')
  @Post('login')
  async login(@Body() dto: any) {
    return this.aiAuthService.login(dto);
  }
}
