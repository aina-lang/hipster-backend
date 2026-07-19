import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { NetflixOtp, NetflixOtpType } from './entities/netflix-otp.entity';
import { NetflixUser } from './entities/netflix-user.entity';

/**
 * Service OTP isolé pour Netflix (aucune dépendance au module otp global).
 * Ici l'envoi se fait via le canal téléphone (à brancher sur Mobile Money / SMS Gateway).
 */
@Injectable()
export class NetflixOtpService {
  constructor(
    @InjectRepository(NetflixOtp)
    private readonly otpRepo: Repository<NetflixOtp>,
  ) {}

  async generateOtp(user: NetflixUser, type: NetflixOtpType): Promise<string> {
    const code = crypto.randomInt(100000, 999999).toString();
    const otp = this.otpRepo.create({ type, user });
    otp.setCode(code);
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);
    otp.expiresAt = expiresAt;
    await this.otpRepo.save(otp);

    // TODO: intégrer la passerelle SMS / WhatsApp / Mobile Money pour envoyer `code`.
    return code;
  }

  async verifyOtp(
    user: NetflixUser,
    code: string,
    type: NetflixOtpType,
    consume = true,
  ): Promise<boolean> {
    const otp = await this.otpRepo.findOne({
      where: { type, user: { id: user.id } },
      order: { createdAt: 'DESC' },
    });
    if (!otp) return false;
    const isValid = await otp.isValid(code);
    if (isValid && consume) {
      otp.consumed = true;
      await this.otpRepo.save(otp);
    }
    return isValid;
  }
}
