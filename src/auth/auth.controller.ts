import { Controller, Post, Body, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { RegisterAuthDto } from './dto/register-auth.dto';
import { LoginAuthDto } from './dto/login-auth.dto';
import { Public } from 'src/common/decorators/public.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { User } from 'src/common/decorators/user.decorator';
import { User as UserEntity } from 'src/users/entities/user.entity';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';

@ApiTags('Auth')
@Controller('')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Public()
  @ApiOperation({ summary: "Inscription d'un nouvel utilisateur" })
  @ApiBody({ type: RegisterAuthDto })
  @ResponseMessage('Utilisateur inscrit avec succès')
  @Post('register')
  async register(@Body() dto: RegisterAuthDto) {
    return this.authService.register(dto);
  }

  @Public()
  @ApiOperation({ summary: 'Connexion utilisateur (login)' })
  @ApiBody({ type: LoginAuthDto })
  @ResponseMessage('Connexion réussie')
  @Post('login')
  async login(@Body() dto: LoginAuthDto) {
    return this.authService.login(dto);
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Changer le mot de passe de l’utilisateur connecté',
  })
  @ResponseMessage('Mot de passe mis à jour')
  @Put('change-password')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @User() user: UserEntity,
  ) {
    return this.authService.changePassword(user.id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt-refresh'))
  @ApiOperation({ summary: 'Rafraîchir le token JWT' })
  @ResponseMessage('Token régénéré avec succès')
  @Post('refresh')
  async refresh(@User() user: any) {
    return this.authService.refreshToken(user.sub, user.refreshToken);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Déconnexion utilisateur' })
  @ResponseMessage('Déconnexion réussie')
  @Post('logout')
  async logout(@User() user: UserEntity) {
    return this.authService.logout(user.id);
  }

  @Public()
  @ApiOperation({ summary: 'Demande de réinitialisation de mot de passe (envoi OTP)' })
  @Post('forgot-password')
  async forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  @Public()
  @ApiOperation({ summary: 'Confirmation OTP et génération nouveau mot de passe' })
  @Post('reset-password')
  async resetPassword(@Body() body: { email: string; code: string; password?: string }) {
    return this.authService.resetPassword(body.email, body.code, body.password);
  }

  @Public()
  @ApiOperation({
    summary: 'Vérification OTP pour réinitialisation de mot de passe',
  })
  @Post('verify-reset-code')
  async verifyResetCode(@Body() body: { email: string; code: string }) {
    return this.authService.verifyResetCode(body.email, body.code);
  }

  @Public()
  @ApiOperation({ summary: 'Vérification de l’email avec OTP' })
  @Post('verify-email')
  async verifyEmail(@Body() body: { email: string; code: string }) {
    return this.authService.verifyEmail(body.email, body.code);
  }

  @Public()
  @ApiOperation({ summary: 'Renvoyer le code OTP de vérification' })
  @Post('resend-otp')
  async resendOtp(@Body('email') email: string) {
    return this.authService.resendOtp(email);
  }
}
