import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KookOtp, KookOtpType } from './entities/kook-otp.entity';
import { KookUser } from './entities/kook-user.entity';

@Injectable()
export class KookOtpService {
  constructor(
    @InjectRepository(KookOtp)
    private readonly otpRepo: Repository<KookOtp>,
  ) {}

  async generateOtp(user: KookUser, type: KookOtpType): Promise<string> {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const otp = this.otpRepo.create({ user, type, expiresAt });
    await otp.setCode(code);
    await this.otpRepo.save(otp);

    return code;
  }

  async verifyOtp(user: KookUser, code: string, type: KookOtpType, consume = false): Promise<boolean> {
    const otps = await this.otpRepo.find({
      where: { user: { id: user.id }, type, consumed: false },
      select: ['id', 'hashedCode', 'expiresAt', 'consumed'],
      order: { createdAt: 'DESC' },
    });

    for (const otp of otps) {
      if (await otp.isValid(code)) {
        if (consume) {
          otp.consumed = true;
          await this.otpRepo.save(otp);
        }
        return true;
      }
    }

    return false;
  }
}
