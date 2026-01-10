import { Controller, Post, Body, UseGuards, Put, Req } from '@nestjs/common';
import { AiAuthService } from './ai-auth.service';
import { Public } from 'src/common/decorators/public.decorator';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiTags, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
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

  @Public()
  @UseGuards(AuthGuard('jwt-refresh-ai'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rafraîchir le token IA' })
  @Post('refresh')
  async refresh(@Req() req) {
    return this.aiAuthService.refreshToken(req.user.sub, req.user.refreshToken);
  }

  @Public()
  @ApiOperation({ summary: 'Vérification email IA' })
  @Post('verify-email')
  async verifyEmail(@Body() body: { email: string; code: string }) {
    return this.aiAuthService.verifyEmail(body.email, body.code);
  }

  @Public()
  @ApiOperation({ summary: 'Renvoyer le code OTP IA' })
  @Post('resend-otp')
  async resendOtp(@Body('email') email: string) {
    return this.aiAuthService.resendOtp(email);
  }

  @Public()
  @UseGuards(AuthGuard('jwt-ai'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mettre à jour le profil IA' })
  @Put('profile')
  async updateProfile(@Req() req, @Body() dto: any) {
    return this.aiAuthService.updateProfile(req.user.sub, dto);
  }

  @Public()
  @UseGuards(AuthGuard('jwt-ai'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Déconnexion utilisateur IA' })
  @Post('logout')
  async logout(@Req() req) {
    return this.aiAuthService.logout(req.user.sub);
  }
}
