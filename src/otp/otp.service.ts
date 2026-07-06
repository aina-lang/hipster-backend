import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Otp } from './enitities/otp.entity';
import { User } from 'src/users/entities/user.entity';

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
  async generateOtp(user: User, type: OtpType): Promise<string> {
    const code = crypto.randomInt(100000, 999999).toString();
    const hashedOtp = await bcrypt.hash(code, 10);
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);
    const otp = this.otpRepository.create({ token: hashedOtp, type, expiresAt, user });
    await this.otpRepository.save(otp);
    return code;
  }

  async verifyOtp(
    user: User,
    code: string,
    type: OtpType,
    consume: boolean = true,
  ): Promise<boolean> {
    const otp = await this.otpRepository.findOne({
      where: { type, user: { id: user.id } },
      order: { createdAt: 'DESC' },
    });
    if (!otp) return false;
    if (otp.expiresAt < new Date()) {
      await this.otpRepository.remove(otp);
      return false;
    }
    const isValid = await bcrypt.compare(code, otp.token);
    if (isValid && consume) {
      await this.otpRepository.remove(otp);
    }
    return isValid;
  }
}
