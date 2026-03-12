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
import { User } from 'src/users/entities/user.entity';
import { RegisterAuthDto } from './dto/register-auth.dto';
import { LoginAuthDto } from './dto/login-auth.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { OtpService } from 'src/otp/otp.service';
import { OtpType } from 'src/common/enums/otp.enum';
import { MailService } from 'src/mail/mail.service';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { ClientType } from 'src/common/enums/client.enum';
import { Role } from 'src/common/enums/role.enum';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(ClientProfile)
    private readonly clientProfileRepo: Repository<ClientProfile>,
    private readonly jwtService: JwtService,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
  ) {}

  private readonly logger = new Logger(AuthService.name);

  async register(dto: RegisterAuthDto) {
    try {
      console.log('[AUTH SERVICE] Register called with DTO:', JSON.stringify(dto, null, 2));
      
      const email = dto.email.trim().toLowerCase();
      const existing = await this.userRepo.findOne({
        where: { email },
      });
      if (existing) throw new ConflictException('Email déjà utilisé.');

      // Validate required fields
      if (!dto.firstName || !dto.lastName || !dto.email || !dto.password) {
        throw new BadRequestException('Tous les champs obligatoires doivent être remplis');
      }

      const hashedPassword = await bcrypt.hash(dto.password, 10);

      // For self-registration via mobile app, we only allow certain roles
      const selectedRole = dto.selectedProfile || Role.CLIENT_MARKETING;

      if (selectedRole === Role.ADMIN || selectedRole === Role.EMPLOYEE) {
        throw new BadRequestException(
          'Ce type de profil ne peut pas être créé via inscription directe.',
        );
      }

      const user = this.userRepo.create({
        email,
        password: hashedPassword,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        roles: [selectedRole],
        isActive: true,
        isEmailVerified: false, // Self-registered users MUST verify their email
      });
      const savedUser = await this.userRepo.save(user);
      console.log('[AUTH SERVICE] User created successfully:', savedUser.id, savedUser.email);

      const profile = this.clientProfileRepo.create({
        companyName: dto.companyName?.trim() || `${dto.firstName}'s Company`,
        clientType: dto.clientType || ClientType.INDIVIDUAL,
        user: savedUser,
      });
      const savedProfile = await this.clientProfileRepo.save(profile);
      console.log('[AUTH SERVICE] Client profile created successfully:', savedProfile.id);

      // 🔑 Generate and send OTP for self-registration
      const otp = await this.otpService.generateOtp(savedUser, OtpType.OTP);
      await this.mailService.sendEmail({
        to: savedUser.email,
        subject: 'Vérification de votre compte Hipster',
        template: 'otp-email',
        context: { name: savedUser.firstName ?? savedUser.email, code: otp },
        userRoles: savedUser.roles,
      });

      console.log('[AUTH SERVICE] Registration completed successfully');
      return {
        message:
          'Inscription réussie. Un code OTP a été envoyé à votre adresse email.',
        email: savedUser.email,
      };
    } catch (error) {
      console.error('[AUTH SERVICE] Registration error caught:', error);
      
      // Check for specific database constraint violations
      if (error?.message?.includes('UNIQUE constraint')) {
        this.logger.error('UNIQUE constraint violation:', error.message);
        throw new ConflictException('Cet email est déjà utilisé.');
      }
      if (error?.message?.includes('NOT NULL')) {
        this.logger.error('NOT NULL constraint violation:', error.message);
        throw new BadRequestException(`Champ obligatoire manquant: ${error.message}`);
      }
      
      // If it's already an HTTP exception, re-throw it
      if (error?.getStatus) {
        throw error;
      }
      
      // Re-throw as BadRequest with details
      this.logger.error('Unexpected registration error:', error);
      throw new BadRequestException(
        error?.message || 'Erreur lors de l\'inscription'
      );
    }
  }

  async login(dto: LoginAuthDto) {
    const email = dto.email.trim().toLowerCase();
    this.logger.log(`Attempting login for user: ${email}`);

    const user = await this.userRepo.findOne({
      where: { email },
      relations: ['clientProfile', 'employeeProfile', 'permissions'],
    });

    if (!user) {
      this.logger.warn(`Login failed: User not found (${email})`);
      throw new NotFoundException("L'utilisateur n'existe pas.");
    }

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) {
      this.logger.warn(`Login failed: Incorrect password for user ${email}`);
      throw new UnauthorizedException('Mot de passe incorrect.');
    }

    if (!user.isEmailVerified) {
      this.logger.log(`Login incomplete: Email not verified for ${email}`);
      // Si mot de passe correct mais email non vérifié => On renvoie un OTP
      await this.resendOtp(user.email);

      throw new UnauthorizedException({
        message:
          'Veuillez vérifier votre email avant de vous connecter. Un nouveau code vous a été envoyé.',
        needsVerification: true,
        email: user.email,
      });
    }

    this.logger.log(`Login successful for user: ${email} (ID: ${user.id})`);

    const payload = { sub: user.id, email: user.email, roles: user.roles };

    // Generate both tokens
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: '4h',
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      expiresIn: '30d',
    });

    // Save refresh token to user (optional but better for security)
    user.refreshToken = refreshToken;
    await this.userRepo.save(user);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: user.roles,
        permissions: user.permissions,
        profiles: {
          client: user.clientProfile,
          employee: user.employeeProfile,
        },
        isEmailVerified: user.isEmailVerified,
        type: 'standard',
      },
    };
  }

  async refreshToken(userId: number, token: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || user.refreshToken !== token) {
      throw new UnauthorizedException('Refresh token invalide ou expiré.');
    }

    const payload = { sub: user.id, email: user.email, roles: user.roles };
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: '4h',
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      expiresIn: '30d',
    });

    user.refreshToken = refreshToken;
    await this.userRepo.save(user);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  async verifyEmail(email: string, code: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.userRepo.findOne({ where: { email: normalizedEmail } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    const isValid = await this.otpService.verifyOtp(user, code, OtpType.OTP);
    if (!isValid) throw new UnauthorizedException('Code invalide ou expiré.');

    user.isEmailVerified = true;

    // Generate tokens for auto-login
    const payload = { sub: user.id, email: user.email, roles: user.roles };
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: '4h',
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      expiresIn: '30d',
    });

    user.refreshToken = refreshToken;
    await this.userRepo.save(user);

    return {
      message: 'Email vérifié avec succès. Connexion automatique...',
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: user.roles,
        permissions: user.permissions,
        profiles: {
          client: user.clientProfile,
          employee: user.employeeProfile,
        },
        isEmailVerified: user.isEmailVerified,
        type: 'standard',
      },
    };
  }

  async resendOtp(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.userRepo.findOne({ where: { email: normalizedEmail } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    if (user.isEmailVerified) {
      throw new ConflictException('Cet email est déjà vérifié.');
    }

    const otp = await this.otpService.generateOtp(user, OtpType.OTP);
    await this.mailService.sendEmail({
      to: user.email,
      subject: 'Nouveau code de vérification Hipster',
      template: 'otp-email',
      context: { name: user.firstName ?? user.email, code: otp },
      userRoles: user.roles,
    });

    return { message: 'Un nouveau code a été envoyé.' };
  }

  async logout(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (user) {
      user.refreshToken = null;
      await this.userRepo.save(user);
    }
    return { message: 'Déconnexion réussie' };
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    const isMatch = await bcrypt.compare(dto.oldPassword, user.password);
    if (!isMatch)
      throw new BadRequestException('Ancien mot de passe incorrect.');


    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepo.update(
      { id: userId },
      { password: hashedPassword }
    );

    return { message: 'Mot de passe mis à jour avec succès.' };
  }

  async forgotPassword(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.userRepo.findOne({ where: { email: normalizedEmail } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    const otp = await this.otpService.generateOtp(user, OtpType.PASSWORD_RESET);
    await this.mailService.sendEmail({
      to: user.email,
      subject: 'Réinitialisation de votre mot de passe Hipster',
      template: 'otp-email', // On peut réutiliser le même template ou un spécifique
      context: { name: user.firstName ?? user.email, code: otp },
      userRoles: user.roles,
    });

    return {
      message:
        'Un code de réinitialisation a été envoyé à votre adresse email.',
    };
  }

  async verifyResetCode(email: string, code: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    const isValid = await this.otpService.verifyOtp(
      user,
      code,
      OtpType.PASSWORD_RESET,
      false, // Do not consume the OTP yet
    );
    if (!isValid) throw new UnauthorizedException('Code invalide ou expiré.');

    return { message: 'Code vérifié avec succès.' };
  }

  async resetPassword(email: string, code: string, password?: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    const isValid = await this.otpService.verifyOtp(
      user,
      code,
      OtpType.PASSWORD_RESET,
    );
    if (!isValid) throw new UnauthorizedException('Code invalide ou expiré.');

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      // Utiliser .update() au lieu de .save() pour forcer la persistance
      await this.userRepo.update(
        { id: user.id },
        { password: hashedPassword }
      );
      return { message: 'Votre mot de passe a été réinitialisé avec succès.' };
    }

    // Générer un nouveau mot de passe temporaire (fallback)
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    const cleanLastName = user.lastName
      ? user.lastName.replace(/[^a-zA-Z0-9]/g, '')
      : 'User';
    const temporaryPassword = `${cleanLastName}${randomDigits}!`;

    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);
    await this.userRepo.update(
      { id: user.id },
      { password: hashedPassword }
    );

    // Envoyer le nouveau mot de passe par email
    await this.mailService.sendWelcomeEmail(
      user.email,
      {
        firstName: user.firstName,
        email: user.email,
        temporaryPassword,
      },
      user.roles,
    );

    return {
      message: 'Votre mot de passe a été réinitialisé. Vérifiez vos emails.',
    };
  }

  async requestEmailChange(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    const otp = await this.otpService.generateOtp(
      user,
      OtpType.EMAIL_CHANGE_CURRENT,
    );

    await this.mailService.sendEmail({
      to: user.email,
      subject: "🔑 Sécurité Hipster : Code de changement d'email",
      template: 'otp-email',
      context: { name: user.firstName ?? user.email, code: otp },
      userRoles: user.roles,
    });

    return {
      message:
        'Un code de vérification a été envoyé à votre adresse email actuelle.',
    };
  }

  async verifyCurrentEmailOtp(userId: number, code: string, newEmail: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    const isAlreadyUsed = await this.userRepo.findOne({
      where: { email: newEmail },
    });
    if (isAlreadyUsed)
      throw new ConflictException('Cette adresse email est déjà utilisée.');

    const isValid = await this.otpService.verifyOtp(
      user,
      code,
      OtpType.EMAIL_CHANGE_CURRENT,
    );
    if (!isValid) throw new UnauthorizedException('Code invalide ou expiré.');

    user.pendingEmail = newEmail;
    await this.userRepo.save(user);

    // Send OTP to NEW email
    const otp = await this.otpService.generateOtp(
      user,
      OtpType.EMAIL_CHANGE_NEW,
    );
    await this.mailService.sendEmail({
      to: newEmail,
      subject: '🔑 Vérification de votre nouvel email Hipster',
      template: 'otp-email',
      context: { name: user.firstName ?? user.email, code: otp },
    });

    return {
      message:
        'Code vérifié. Un nouveau code a été envoyé à votre nouvelle adresse email.',
    };
  }

  async confirmNewEmailOtp(userId: number, code: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    if (!user.pendingEmail)
      throw new BadRequestException("Aucun changement d'email en cours.");

    const isValid = await this.otpService.verifyOtp(
      user,
      code,
      OtpType.EMAIL_CHANGE_NEW,
    );
    if (!isValid) throw new UnauthorizedException('Code invalide ou expiré.');

    const oldEmail = user.email;
    user.email = user.pendingEmail;
    user.pendingEmail = undefined;
    user.refreshToken = null; // Forces re-login after email change
    await this.userRepo.save(user);

    // Optional: send confirmation to OLD email
    await this.mailService.sendWelcomeEmail(
      oldEmail,
      {
        firstName: user.firstName,
        message: `Votre adresse email a été modifiée avec succès de ${oldEmail} vers ${user.email}.`,
      },
      user.roles,
    );

    return {
      message:
        'Votre adresse email a été mise à jour avec succès. Veuillez vous reconnecter.',
    };
  }
}
