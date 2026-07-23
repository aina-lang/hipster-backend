import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { KookUser, KookUserType } from './entities/kook-user.entity';
import { KookOtpType } from './entities/kook-otp.entity';
import { RegisterKookDto } from './dto/register-kook.dto';
import { VerifyOtpKookDto } from './dto/verify-otp-kook.dto';
import { RefreshKookDto } from './dto/refresh-kook.dto';
import { RegisterAuthDto } from './dto/register-auth.dto';
import { LoginAuthDto } from './dto/login-auth.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { KookOtpService } from './kook-otp.service';
import { KookMailService } from './services/kook-mail.service';

@Injectable()
export class KookAuthService {
  private readonly logger = new Logger(KookAuthService.name);

  constructor(
    @InjectRepository(KookUser)
    private readonly userRepo: Repository<KookUser>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly otp: KookOtpService,
    private readonly kookMailService: KookMailService,
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

    const code = await this.otp.generateOtp(user, KookOtpType.LOGIN);

    try {
      await this.kookMailService.sendOtpEmail(dto.email, {
        name: dto.firstName || dto.email,
        code,
      });
    } catch (e) {
      this.logger.error(`Impossible d\'envoyer l\'email OTP à ${dto.email}: ${e.message}`);
      throw new BadRequestException(
        "Impossible d'envoyer l'email de vérification. Réessayez dans quelques instants.",
      );
    }

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
        pseudo: user.pseudo,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        coverUrl: user.coverUrl,
        userType: user.userType,
        plan: user.plan,
        isEmailVerified: user.isEmailVerified,
      },
    };
  }

  async registerWithPassword(dto: RegisterAuthDto) {
    const existingByEmail = await this.userRepo.findOne({ where: { email: dto.email } });
    const existingByPseudo = await this.userRepo.findOne({ where: { pseudo: dto.pseudo } });

    if (existingByPseudo && existingByPseudo.email !== dto.email) {
      throw new ConflictException('Ce pseudo est déjà utilisé');
    }

    let user: KookUser;
    if (existingByEmail) {
      if (existingByEmail.isEmailVerified) {
        throw new ConflictException('Cet email est déjà utilisé');
      }
      // Account exists but was never verified (e.g. the previous verification email
      // failed to send, or the code expired). Reuse it and send a fresh code instead
      // of permanently locking this email address out of registering.
      user = existingByEmail;
      user.pseudo = dto.pseudo;
      user.password = await bcrypt.hash(dto.password, 10);
      await this.userRepo.save(user);
    } else {
      user = this.userRepo.create({
        pseudo: dto.pseudo,
        email: dto.email,
        password: await bcrypt.hash(dto.password, 10),
        userType: KookUserType.CREATOR,
      });
      await this.userRepo.save(user);
    }

    const code = await this.otp.generateOtp(user, KookOtpType.REGISTER);

    try {
      await this.kookMailService.sendOtpEmail(dto.email, {
        name: dto.pseudo,
        code,
      });
    } catch (e) {
      this.logger.error(`Impossible d\'envoyer l\'email OTP à ${dto.email}: ${e.message}`);
      throw new BadRequestException(
        "Impossible d'envoyer l'email de vérification. Vérifiez l'adresse saisie ou réessayez dans quelques instants.",
      );
    }

    return { message: 'Inscription réussie, code de vérification envoyé', email: dto.email };
  }

  async verifyRegistration(dto: VerifyCodeDto) {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Utilisateur introuvable');

    const valid = await this.otp.verifyOtp(user, dto.code, KookOtpType.REGISTER, true);
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
        pseudo: user.pseudo,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        coverUrl: user.coverUrl,
        userType: user.userType,
        plan: user.plan,
        isEmailVerified: user.isEmailVerified,
      },
    };
  }

  async loginWithPassword(dto: LoginAuthDto) {
    const user = await this.userRepo.findOne({
      where: [
        { email: dto.emailOrPseudo },
        { pseudo: dto.emailOrPseudo },
      ],
      select: ['id', 'email', 'pseudo', 'password', 'userType', 'plan', 'isEmailVerified', 'firstName', 'lastName', 'avatarUrl', 'coverUrl'],
    });

    if (!user || !user.password) throw new UnauthorizedException('Email/Pseudo ou mot de passe incorrect');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Email/Pseudo ou mot de passe incorrect');

    if (!user.isEmailVerified) {
      const code = await this.otp.generateOtp(user, KookOtpType.REGISTER);
      this.kookMailService
        .sendOtpEmail(user.email, { name: user.pseudo || user.email, code })
        .catch((e) => this.logger.warn(`Impossible d\'envoyer l\'email de vérification à ${user.email}: ${e.message}`));
      throw new UnauthorizedException({
        message: 'Veuillez vérifier votre adresse email avant de vous connecter. Un nouveau code vous a été envoyé.',
        code: 'EMAIL_NOT_VERIFIED',
        email: user.email,
      });
    }

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
        pseudo: user.pseudo,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        coverUrl: user.coverUrl,
        userType: user.userType,
        plan: user.plan,
        isEmailVerified: user.isEmailVerified,
      },
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Aucun compte trouvé avec cet email');

    const code = await this.otp.generateOtp(user, KookOtpType.PASSWORD_RESET);

    try {
      await this.kookMailService.sendOtpEmail(dto.email, {
        name: user.pseudo || user.email,
        code,
      });
    } catch (e) {
      this.logger.error(`Impossible d\'envoyer l\'email de réinitialisation à ${dto.email}: ${e.message}`);
      throw new BadRequestException(
        "Impossible d'envoyer l'email de réinitialisation. Réessayez dans quelques instants.",
      );
    }

    return { message: 'Code de réinitialisation envoyé', email: dto.email };
  }

  async verifyResetCode(dto: VerifyCodeDto) {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Utilisateur introuvable');

    const valid = await this.otp.verifyOtp(user, dto.code, KookOtpType.PASSWORD_RESET, true);
    if (!valid) throw new UnauthorizedException('Code invalide ou expiré');

    const token = this.jwt.sign(
      { sub: user.id, email: user.email, purpose: 'password_reset' },
      { expiresIn: '15m' },
    );

    this.logger.log(`[reset-password] token genere pour ${dto.email}`);

    return { message: 'Code vérifié', token, email: dto.email };
  }

  async resetPassword(dto: ResetPasswordDto) {
    this.logger.log(`[reset-password] tentative verification token pour ${dto.email}`);
    let payload: { sub: number; email: string; purpose: string };
    try {
      payload = this.jwt.verify(dto.token);
    } catch (e: any) {
      this.logger.error(`[reset-password] echec verification token: ${e?.message || e}`);
      throw new UnauthorizedException('Token de réinitialisation invalide ou expiré');
    }

    if (payload.purpose !== 'password_reset' || payload.email !== dto.email) {
      this.logger.warn(`[reset-password] payload invalide: purpose=${payload.purpose}`);
      throw new UnauthorizedException('Token de réinitialisation invalide');
    }

    const user = await this.userRepo.findOne({
      where: { email: dto.email },
      select: ['id', 'email', 'password'],
    });
    if (!user) throw new UnauthorizedException('Utilisateur introuvable');

    user.password = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepo.save(user);

    return { message: 'Mot de passe réinitialisé avec succès' };
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'email', 'password'],
    });
    if (!user) throw new UnauthorizedException('Utilisateur introuvable');

    if (!user.password) throw new BadRequestException('Aucun mot de passe défini');

    const valid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!valid) throw new UnauthorizedException('Mot de passe actuel incorrect');

    user.password = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepo.save(user);

    return { message: 'Mot de passe modifié avec succès' };
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
