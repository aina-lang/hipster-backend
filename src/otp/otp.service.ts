import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Otp } from './enitities/otp.entity';
import { User } from 'src/users/entities/user.entity';
import { AiUser } from 'src/ai/entities/ai-user.entity';
import { OtpType } from 'src/common/enums/otp.enum';
import * as bcrypt from 'bcrypt';

@Injectable()
export class OtpService {
  constructor(
    @InjectRepository(Otp)
    private readonly otpRepository: Repository<Otp>,
  ) {}

  /**
   * Génère un OTP à usage unique pour un utilisateur donné (standard ou AI)
   */
  async generateOtp(user: User | AiUser, type: OtpType): Promise<string> {
    // Générer un code OTP à 6 chiffres
    const code = crypto.randomInt(100000, 999999).toString();
    const hashedOtp = await bcrypt.hash(code, 10);

    // Définir la date d'expiration (ex: 5 minutes)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    // Sauvegarde dans la base de données
    const isAi = !('roles' in user);
    
    const otpData: any = {
      token: hashedOtp,
      type,
      expiresAt,
    };

    if (isAi) {
      otpData.aiUser = user;
    } else {
      otpData.user = user;
    }

    const otp = this.otpRepository.create(otpData);
    await this.otpRepository.save(otp);
    return code;
  }

  async verifyOtp(
    user: User | AiUser,
    code: string,
    type: OtpType,
    consume: boolean = true,
  ): Promise<boolean> {
    const isAi = !('roles' in user);
    
    const where: any = { type };
    if (isAi) {
      where.aiUser = { id: user.id };
    } else {
      where.user = { id: user.id };
    }

    const otp = await this.otpRepository.findOne({
      where,
      order: { createdAt: 'DESC' }, // Get the latest one
    });

    if (!otp) return false;

    if (otp.expiresAt < new Date()) {
      await this.otpRepository.remove(otp); // Clean up expired
      return false;
    }

    const isValid = await bcrypt.compare(code, otp.token);
    if (isValid) {
      if (consume) {
        await this.otpRepository.remove(otp); // Consume OTP
      }
      return true;
    }

    return false;
  }
}
