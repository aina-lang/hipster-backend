import { Body, Controller, Post, UseGuards, Req } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { KookAuthGuard } from './kook-auth.guard';
import { KookAuthService } from './kook-auth.service';
import { RegisterKookDto } from './dto/register-kook.dto';
import { VerifyOtpKookDto } from './dto/verify-otp-kook.dto';
import { RefreshKookDto } from './dto/refresh-kook.dto';
import { RegisterAuthDto } from './dto/register-auth.dto';
import { LoginAuthDto } from './dto/login-auth.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { KookUser } from './kook-user.decorator';

@Controller('kook/auth')
export class KookAuthController {
  constructor(private readonly auth: KookAuthService) {}

  @Public()
  @Post('request-code')
  async requestCode(@Body() dto: RegisterKookDto) {
    return this.auth.requestCode(dto);
  }

  @Public()
  @Post('verify-code')
  async verifyCode(@Body() dto: VerifyOtpKookDto) {
    return this.auth.verifyCode(dto);
  }

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterAuthDto) {
    return this.auth.registerWithPassword(dto);
  }

  @Public()
  @Post('verify-registration')
  async verifyRegistration(@Body() dto: VerifyCodeDto) {
    return this.auth.verifyRegistration(dto);
  }

  @Public()
  @Post('login')
  async login(@Body() dto: LoginAuthDto) {
    return this.auth.loginWithPassword(dto);
  }

  @Public()
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Public()
  @Post('verify-reset-code')
  async verifyResetCode(@Body() dto: VerifyCodeDto) {
    return this.auth.verifyResetCode(dto);
  }

  @Public()
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @Public()
  @UseGuards(KookAuthGuard)
  @Post('change-password')
  async changePassword(@KookUser() user: any, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto);
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() dto: RefreshKookDto) {
    return this.auth.refresh(dto);
  }

  @Public()
  @UseGuards(KookAuthGuard)
  @Post('logout')
  async logout(@KookUser() user: any) {
    return this.auth.logout(user.id);
  }
}
