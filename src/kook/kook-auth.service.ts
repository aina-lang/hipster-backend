import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { KookUser, KookUserType } from './entities/kook-user.entity';
import { KookOtpType } from './entities/kook-otp.entity';
import { RegisterKookDto } from './dto/register-kook.dto';
import { VerifyOtpKookDto } from './dto/verify-otp-kook.dto';
import { RefreshKookDto } from './dto/refresh-kook.dto';
import { KookOtpService } from './kook-otp.service';

@Injectable()
export class KookAuthService {
  private readonly logger = new Logger(KookAuthService.name);

  constructor(
    @InjectRepository(KookUser)
    private readonly userRepo: Repository<KookUser>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly otp: KookOtpService,
  ) {}

  async requestCode(dto: RegisterKookDto) {
    let user = await this.userRepo.findOne({ where: { email: dto.email } });

    if (!user) {
      user = this.userRepo.create({
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        userType: KookUserType.CREATOR,
      });
      user = await this.userRepo.save(user);
    }

    await this.otp.generateOtp(user, KookOtpType.LOGIN);
    this.logger.debug(`Code OTP envoyé à ${dto.email}`);

    return { message: 'Code de vérification envoyé', email: dto.email };
  }

  async verifyCode(dto: VerifyOtpKookDto) {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Utilisateur introuvable');

    const valid = await this.otp.verifyOtp(user, dto.code, KookOtpType.LOGIN, true);
    if (!valid) throw new UnauthorizedException('Code invalide ou expiré');

    user.isEmailVerified = true;
    await this.userRepo.save(user);

    const payload = { sub: user.id, email: user.email, type: 'kook' };
    const access_token = this.jwt.sign(payload, { expiresIn: '4h' });
    const refresh_token = this.jwt.sign(payload, { expiresIn: '30d' });

    user.refreshToken = refresh_token;
    user.refreshTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.userRepo.save(user);

    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        userType: user.userType,
        plan: user.plan,
        isEmailVerified: user.isEmailVerified,
      },
    };
  }

  async refresh(dto: RefreshKookDto) {
    const user = await this.userRepo.findOne({
      where: { email: dto.email },
      select: ['id', 'email', 'refreshToken', 'refreshTokenExpiresAt'],
    });

    if (!user || user.refreshToken !== dto.refreshToken) {
      throw new UnauthorizedException('Refresh token invalide');
    }

    if (user.refreshTokenExpiresAt && user.refreshTokenExpiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expiré');
    }

    const payload = { sub: user.id, email: user.email, type: 'kook' };
    const access_token = this.jwt.sign(payload, { expiresIn: '4h' });
    const refresh_token = this.jwt.sign(payload, { expiresIn: '30d' });

    user.refreshToken = refresh_token;
    user.refreshTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.userRepo.save(user);

    return { access_token, refresh_token };
  }

  async logout(userId: number) {
    await this.userRepo.update(userId, { refreshToken: null, refreshTokenExpiresAt: null });
    return { message: 'Déconnexion réussie' };
  }
}
