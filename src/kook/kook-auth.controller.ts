import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { KookAuthService } from './kook-auth.service';
import { RegisterKookDto } from './dto/register-kook.dto';
import { VerifyOtpKookDto } from './dto/verify-otp-kook.dto';
import { RefreshKookDto } from './dto/refresh-kook.dto';

@Controller('kook/auth')
export class KookAuthController {
  constructor(private readonly auth: KookAuthService) {}

  @Post('request-code')
  async requestCode(@Body() dto: RegisterKookDto) {
    return this.auth.requestCode(dto);
  }

  @Post('verify-code')
  async verifyCode(@Body() dto: VerifyOtpKookDto) {
    return this.auth.verifyCode(dto);
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshKookDto) {
    return this.auth.refresh(dto);
  }

  @UseGuards(AuthGuard('kook-jwt'))
  @Post('logout')
  async logout(@Body('userId') userId: number) {
    return this.auth.logout(userId);
  }
}
