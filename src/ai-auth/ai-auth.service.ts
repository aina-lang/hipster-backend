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
import {
  AiUser,
  PlanType,
  SubscriptionStatus,
} from 'src/ai/entities/ai-user.entity';
import { OtpService } from 'src/otp/otp.service';
import { OtpType } from 'src/common/enums/otp.enum';
import { MailService } from 'src/mail/mail.service';
import { Public } from 'src/common/decorators/public.decorator';
import { deleteFile } from 'src/common/utils/file.utils';
import { AiPaymentService } from 'src/ai-payment/ai-payment.service';

@Injectable()
export class AiAuthService {
  constructor(
    @InjectRepository(AiUser)
    private readonly aiUserRepo: Repository<AiUser>,
    private readonly jwtService: JwtService,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
    private readonly aiPaymentService: AiPaymentService,
  ) {}

  private readonly logger = new Logger(AiAuthService.name);

  @Public()
  async register(dto: any) {
    const normalizedEmail = dto.email?.trim().toLowerCase();
    let user = await this.aiUserRepo.findOne({
      where: { email: normalizedEmail },
    });

    if (user) {
      throw new ConflictException('Email déjà utilisé.');
    } else {
      const hashedPassword = await bcrypt.hash(dto.password, 10);
      user = this.aiUserRepo.create({
        email: normalizedEmail,
        password: hashedPassword,
        name: dto.name || '',
        isActive: false, // Inactive until OTP verified
        isEmailVerified: false,
      });
    }

    const planTypeInput = dto.planId ? dto.planId.toLowerCase() : 'curieux';
    const plans = await this.aiPaymentService.getPlans();
    const curieuxPlan = plans.find((p) => p.id === 'curieux') || plans[0];
    const selectedPlanConfig =
      plans.find((p) => p.id === planTypeInput) || curieuxPlan;

    // Apply plan limits and status directly to user
    user.promptsLimit = selectedPlanConfig.promptsLimit;
    user.imagesLimit = selectedPlanConfig.imagesLimit;
    user.videosLimit = selectedPlanConfig.videosLimit;
    user.audioLimit = selectedPlanConfig.audioLimit;
    user.threeDLimit = selectedPlanConfig.threeDLimit || 0;

    user.planType =
      PlanType[selectedPlanConfig.id.toUpperCase() as keyof typeof PlanType] ||
      PlanType.CURIEUX;

    const startDate = new Date();
    const endDate = new Date();

    if (planTypeInput === 'curieux') {
      endDate.setDate(endDate.getDate() + 7);
      user.subscriptionStatus = SubscriptionStatus.TRIAL;
      user.hasUsedTrial = true;
    } else {
      endDate.setDate(endDate.getDate() + 30);
      user.subscriptionStatus = SubscriptionStatus.ACTIVE;
    }

    user.subscriptionStartDate = startDate;
    user.subscriptionEndDate = endDate;

    await this.aiUserRepo.save(user);

    const otp = await this.otpService.generateOtp(user, OtpType.OTP);
    await this.mailService.sendEmail({
      to: user.email,
      subject: 'Vérification de votre compte AI Hipster',
      template: 'otp-email',
      context: {
        name: user.name || user.email,
        code: otp,
      },
    });

    let stripeData = null;
    if (dto.planId && dto.planId !== 'curieux') {
      const plan = plans.find((p) => p.id === dto.planId);
      if (plan && plan.stripePriceId) {
        stripeData = await this.aiPaymentService.createPaymentSheet(
          user.id,
          plan.stripePriceId,
        );
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
        name: user.name,
        isEmailVerified: user.isEmailVerified,
        planType: user.planType,
        subscriptionStatus: user.subscriptionStatus,
        promptsLimit: user.promptsLimit,
        imagesLimit: user.imagesLimit,
        videosLimit: user.videosLimit,
        audioLimit: user.audioLimit,
        threeDLimit: user.threeDLimit,
        subscriptionEndDate: user.subscriptionEndDate,
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
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    const isValid = await this.otpService.verifyOtp(user, code, OtpType.OTP);
    if (!isValid) throw new BadRequestException('Code invalide ou expiré.');

    user.isEmailVerified = true;
    user.isActive = true; // Activate account now

    // Generate tokens for auto-login
    const payload = {
      sub: user.id,
      email: user.email,
      type: 'ai',
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
        name: user.name,
        isEmailVerified: user.isEmailVerified,
        planType: user.planType,
        subscriptionStatus: user.subscriptionStatus,
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
        name: user.name || user.email,
        code: otp,
      },
    });

    return { message: 'Nouveau code OTP envoyé.' };
  }

  async updateProfile(id: number, dto: any) {
    const user = await this.aiUserRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    if (dto.name) user.name = dto.name;

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
