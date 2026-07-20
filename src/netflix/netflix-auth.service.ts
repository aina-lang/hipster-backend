import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NetflixUser, NetflixUserType } from './entities/netflix-user.entity';
import { NetflixOtpType } from './entities/netflix-otp.entity';
import { RegisterNetflixDto } from './dto/register-netflix.dto';
import { VerifyOtpNetflixDto } from './dto/verify-otp-netflix.dto';
import { RefreshNetflixDto } from './dto/refresh-netflix.dto';
import { NetflixOtpService } from './netflix-otp.service';

/**
 * Auth isolée Netflix : inscription / connexion par email.
 * Aucune dépendance vers users/auth/profiles/mail des autres apps.
 */
@Injectable()
export class NetflixAuthService {
  private readonly logger = new Logger(NetflixAuthService.name);

  constructor(
    @InjectRepository(NetflixUser)
    private readonly userRepo: Repository<NetflixUser>,
    private readonly jwtService: JwtService,
    private readonly otpService: NetflixOtpService,
  ) {}

  private buildTokens(user: NetflixUser) {
    const payload = {
      sub: user.id,
      email: user.email,
      userType: user.userType,
      type: 'netflix',
    };
    return {
      access_token: this.jwtService.sign(payload, { expiresIn: '4h' }),
      refresh_token: this.jwtService.sign(payload, { expiresIn: '30d' }),
    };
  }

  /** Étape 1 : demande de code (inscription ou connexion). */
  async requestCode(dto: RegisterNetflixDto) {
    const email = dto.email.trim().toLowerCase();
    let user = await this.userRepo.findOne({ where: { email } });

    if (!user) {
      user = this.userRepo.create({
        email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        userType: NetflixUserType.CREATOR,
        isEmailVerified: false,
      });
      user = await this.userRepo.save(user);
    }

    const code = await this.otpService.generateOtp(user, NetflixOtpType.LOGIN);
    this.logger.debug(`[NETFLIX] code for ${email}: ${code}`);
    return { message: 'Code envoyé par email.', email };
  }

  /** Étape 2 : vérification du code -> login ou création de compte. */
  async verifyCode(dto: VerifyOtpNetflixDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    const ok = await this.otpService.verifyOtp(user, dto.code, NetflixOtpType.LOGIN);
    if (!ok) throw new UnauthorizedException('Code invalide ou expiré.');

    user.isEmailVerified = true;
    await this.userRepo.save(user);

    const tokens = this.buildTokens(user);
    user.refreshToken = tokens.refresh_token;
    const exp = new Date();
    exp.setDate(exp.getDate() + 30);
    user.refreshTokenExpiresAt = exp;
    await this.userRepo.save(user);

    return { ...tokens, user: this.serialize(user) };
  }

  async refresh(dto: RefreshNetflixDto) {
    const user = await this.userRepo.findOne({ where: { email: dto.email.trim().toLowerCase() } });
    if (!user || user.refreshToken !== dto.refreshToken) {
      throw new UnauthorizedException('Refresh token invalide.');
    }
    if (user.refreshTokenExpiresAt && user.refreshTokenExpiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expiré.');
    }
    const tokens = this.buildTokens(user);
    user.refreshToken = tokens.refresh_token;
    await this.userRepo.save(user);
    return tokens;
  }

  async logout(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (user) {
      user.refreshToken = null;
      user.refreshTokenExpiresAt = null;
      await this.userRepo.save(user);
    }
    return { message: 'Déconnexion réussie.' };
  }

  private serialize(user: NetflixUser) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      userType: user.userType,
      plan: user.plan,
      isEmailVerified: user.isEmailVerified,
    };
  }
}
