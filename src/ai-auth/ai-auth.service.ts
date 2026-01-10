import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
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
} from 'src/profiles/entities/ai-subscription-profile.entity';
import { OtpService } from 'src/otp/otp.service';
import { OtpType } from 'src/common/enums/otp.enum';
import { MailService } from 'src/mail/mail.service';

@Injectable()
export class AiAuthService {
  constructor(
    @InjectRepository(AiUser)
    private readonly aiUserRepo: Repository<AiUser>,
    @InjectRepository(AiSubscriptionProfile)
    private readonly aiProfileRepo: Repository<AiSubscriptionProfile>,
    private readonly jwtService: JwtService,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: any) {
    const existing = await this.aiUserRepo.findOne({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email déjà utilisé.');

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = this.aiUserRepo.create({
      email: dto.email,
      password: hashedPassword,
      firstName: dto.firstName,
      lastName: dto.lastName || '',
      isActive: true,
      isEmailVerified: false,
    });
    await this.aiUserRepo.save(user);

    const profile = this.aiProfileRepo.create({
      aiUser: user,
      accessLevel: AiAccessLevel.GUEST,
      credits: 5,
    });
    await this.aiProfileRepo.save(profile);

    const otp = await this.otpService.generateOtp(user as any, OtpType.OTP);
    await this.mailService.sendEmail({
      to: user.email,
      subject: 'Vérification de votre compte AI Hipster',
      template: 'otp-email',
      context: { name: user.firstName ?? user.email, code: otp },
      userRoles: ['ai_user'], // Standardized AI role
    });

    return {
      message: 'Inscription AI réussie. Un code OTP a été envoyé.',
      email: user.email,
    };
  }

  async login(dto: any) {
    const user = await this.aiUserRepo.findOne({
      where: { email: dto.email },
      relations: ['aiProfile'],
    });

    if (!user) throw new UnauthorizedException('Identifiants invalides.');

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) throw new UnauthorizedException('Identifiants invalides.');

    if (!user.isEmailVerified) {
      throw new UnauthorizedException({
        message: 'Veuillez vérifier votre email AI.',
        needsVerification: true,
        email: user.email,
      });
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
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profile: user.aiProfile,
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
    const user = await this.aiUserRepo.findOne({ where: { email } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    const isValid = await this.otpService.verifyOtp(
      user as any,
      code,
      OtpType.OTP,
    );
    if (!isValid) throw new BadRequestException('Code invalide ou expiré.');

    user.isEmailVerified = true;
    await this.aiUserRepo.save(user);

    return { message: 'Email vérifié avec succès.' };
  }

  async resendOtp(email: string) {
    const user = await this.aiUserRepo.findOne({ where: { email } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    const otp = await this.otpService.generateOtp(user as any, OtpType.OTP);
    await this.mailService.sendEmail({
      to: user.email,
      subject: 'Vérification de votre compte AI Hipster',
      template: 'otp-email',
      context: { name: user.firstName ?? user.email, code: otp },
      userRoles: ['client_ai'],
    });

    return { message: 'Nouveau code OTP envoyé.' };
  }

  async updateProfile(id: number, dto: any) {
    const user = await this.aiUserRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    if (dto.firstName) user.firstName = dto.firstName;
    if (dto.lastName) user.lastName = dto.lastName;

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
}
