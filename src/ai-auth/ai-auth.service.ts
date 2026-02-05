import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AiUser } from 'src/ai/entities/ai-user.entity';
import {
  AiSubscriptionProfile,
  AiAccessLevel,
  PlanType,
  SubscriptionStatus,
} from 'src/profiles/entities/ai-subscription-profile.entity';
import { OtpService } from 'src/otp/otp.service';
import { OtpType } from 'src/common/enums/otp.enum';
import { MailService } from 'src/mail/mail.service';
import { Public } from 'src/common/decorators/public.decorator';
import { AiCredit } from 'src/profiles/entities/ai-credit.entity';
import { deleteFile } from 'src/common/utils/file.utils';
import { AiPaymentService } from 'src/ai-payment/ai-payment.service';

@Injectable()
export class AiAuthService {
  constructor(
    @InjectRepository(AiUser)
    private readonly aiUserRepo: Repository<AiUser>,
    @InjectRepository(AiSubscriptionProfile)
    private readonly aiProfileRepo: Repository<AiSubscriptionProfile>,
    @InjectRepository(AiCredit)
    private readonly aiCreditRepo: Repository<AiCredit>,
    private readonly jwtService: JwtService,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
    private readonly aiPaymentService: AiPaymentService,
  ) {}

  private readonly logger = new Logger(AiAuthService.name);

  @Public()
  async register(dto: any) {
    const email = dto.email?.trim().toLowerCase();
    const existing = await this.aiUserRepo.findOne({
      where: { email },
    });
    if (existing) throw new ConflictException('Email déjà utilisé.');

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = this.aiUserRepo.create({
      email,
      password: hashedPassword,
      firstName: '', // No longer used in setup
      lastName: dto.lastName || '', // Stores the "Full Name / Company Name"
      isActive: true,
      isEmailVerified: false,
    });
    await this.aiUserRepo.save(user);

    const planTypeInput = dto.planId ? dto.planId.toLowerCase() : 'curieux';
    const profile = this.aiProfileRepo.create({
      aiUser: user,
      accessLevel: AiAccessLevel.GUEST,
      planType:
        (PlanType as any)[planTypeInput.toUpperCase()] || PlanType.CURIEUX,
      subscriptionStatus:
        planTypeInput === 'curieux'
          ? SubscriptionStatus.ACTIVE
          : SubscriptionStatus.TRIAL,
    });
    await this.aiProfileRepo.save(profile);

    // Create default AiCredit for the profile
    const credit = this.aiCreditRepo.create({
      promptsLimit: 100,
      imagesLimit: 50,
      videosLimit: 10,
      audioLimit: 20,
      aiProfile: profile,
    });
    await this.aiCreditRepo.save(credit);

    const otp = await this.otpService.generateOtp(user, OtpType.OTP);
    await this.mailService.sendEmail({
      to: user.email,
      subject: 'Vérification de votre compte AI Hipster',
      template: 'otp-email',
      context: {
        name: user.lastName || user.firstName || user.email,
        code: otp,
      },
      userRoles: ['ai_user'], // Standardized AI role
    });

    let stripeData = null;
    if (dto.planId && dto.planId !== 'curieux') {
      const plan = this.aiPaymentService
        .getPlans()
        .find((p) => p.id === dto.planId);
      if (plan && plan.stripePriceId) {
        stripeData = await this.aiPaymentService.createPaymentSheet(
          user.id,
          plan.stripePriceId,
        );

        // Mark user as potentially requiring verification but also payment
        // For now just returning data so the app can show the payment sheet
      }
    }

    return {
      message: 'Inscription AI réussie. Un code OTP a été envoyé.',
      email: user.email,
      userId: user.id,
      stripe: stripeData,
    };
  }

  async login(dto: any) {
    const email = dto.email?.trim().toLowerCase();
    this.logger.log(`Attempting AI login for user: ${email}`);

    const user = await this.aiUserRepo.findOne({
      where: { email },
      relations: ['aiProfile'],
    });

    if (!user) {
      this.logger.warn(`AI Login failed: User not found (${email})`);
      throw new NotFoundException("L'utilisateur AI n'existe pas.");
    }

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) {
      this.logger.warn(`AI Login failed: Incorrect password for user ${email}`);
      throw new UnauthorizedException('Mot de passe incorrect.');
    }

    if (!user.isEmailVerified) {
      this.logger.log(`AI Login incomplete: Email not verified for ${email}`);
      throw new UnauthorizedException({
        message: 'Veuillez vérifier votre email AI.',
        needsVerification: true,
        email: user.email,
      });
    }

    this.logger.log(`AI Login successful for user: ${email} (ID: ${user.id})`);

    const payload = {
      sub: user.id,
      email: user.email,
      type: 'ai',
      roles: ['ai_user'],
    };
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: '4h',
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      expiresIn: '30d',
    });

    user.refreshToken = refreshToken;
    await this.aiUserRepo.save(user);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        aiProfile: user.aiProfile,
        isEmailVerified: user.isEmailVerified,
        roles: ['ai_user'],
        type: 'ai',
      },
    };
  }

  async refreshToken(userId: number, token: string) {
    const user = await this.aiUserRepo.findOne({ where: { id: userId } });
    if (!user || user.refreshToken !== token) {
      throw new UnauthorizedException('Refresh token invalide ou expiré.');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      type: 'ai',
      roles: ['ai_user'],
    };
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: '4h',
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      expiresIn: '30d',
    });

    user.refreshToken = refreshToken;
    await this.aiUserRepo.save(user);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  async verifyEmail(email: string, code: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.aiUserRepo.findOne({
      where: { email: normalizedEmail },
      relations: ['aiProfile'],
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    const isValid = await this.otpService.verifyOtp(user, code, OtpType.OTP);
    if (!isValid) throw new BadRequestException('Code invalide ou expiré.');

    user.isEmailVerified = true;

    // Generate tokens for auto-login
    const payload = {
      sub: user.id,
      email: user.email,
      type: 'ai',
      roles: ['ai_user'],
    };
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: '4h',
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      expiresIn: '30d',
    });

    user.refreshToken = refreshToken;
    await this.aiUserRepo.save(user);

    return {
      message: 'Email vérifié avec succès.',
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        aiProfile: user.aiProfile,
        isEmailVerified: user.isEmailVerified,
        roles: ['ai_user'],
        type: 'ai',
      },
    };
  }

  async resendOtp(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.aiUserRepo.findOne({
      where: { email: normalizedEmail },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    const otp = await this.otpService.generateOtp(user, OtpType.OTP);
    await this.mailService.sendEmail({
      to: user.email,
      subject: 'Vérification de votre compte AI Hipster',
      template: 'otp-email',
      context: {
        name: user.lastName || user.firstName || user.email,
        code: otp,
      },
      userRoles: ['ai_user'],
    });

    return { message: 'Nouveau code OTP envoyé.' };
  }

  async updateProfile(id: number, dto: any) {
    const user = await this.aiUserRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    if (dto.lastName) user.lastName = dto.lastName;
    // firstName is ignored in simplified flow

    if (dto.avatarUrl && user.avatarUrl && dto.avatarUrl !== user.avatarUrl) {
      deleteFile(user.avatarUrl);
    }

    if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl;

    await this.aiUserRepo.save(user);
    return user;
  }

  async logout(userId: number) {
    const user = await this.aiUserRepo.findOne({ where: { id: userId } });
    if (user) {
      user.refreshToken = null;
      await this.aiUserRepo.save(user);
    }
    return { message: 'Déconnexion AI réussie' };
  }

  async changePassword(userId: number, dto: any) {
    const user = await this.aiUserRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    const isMatch = await bcrypt.compare(dto.oldPassword, user.password);
    if (!isMatch)
      throw new UnauthorizedException('Mot de passe actuel incorrect.');

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    user.password = hashedPassword;
    await this.aiUserRepo.save(user);

    return { message: 'Mot de passe modifié avec succès.' };
  }
}
