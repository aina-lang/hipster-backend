import { Body, Controller, Post, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NetflixAuthService } from './netflix-auth.service';
import { RegisterNetflixDto } from './dto/register-netflix.dto';
import { VerifyOtpNetflixDto } from './dto/verify-otp-netflix.dto';
import { RefreshNetflixDto } from './dto/refresh-netflix.dto';

@Controller('netflix/auth')
export class NetflixAuthController {
  constructor(private readonly authService: NetflixAuthService) {}

  @Post('request-code')
  requestCode(@Body() dto: RegisterNetflixDto) {
    return this.authService.requestCode(dto);
  }

  @Post('verify-code')
  verifyCode(@Body() dto: VerifyOtpNetflixDto) {
    return this.authService.verifyCode(dto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshNetflixDto) {
    return this.authService.refresh(dto);
  }

  @UseGuards(AuthGuard('netflix-jwt'))
  @Post('logout')
  logout(@Req() req) {
    return this.authService.logout(req.user.id);
  }
}
