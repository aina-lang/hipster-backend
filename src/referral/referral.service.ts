import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiUser, SubscriptionStatus, PlanType } from 'src/ai/entities/ai-user.entity';
import { randomBytes } from 'crypto';

@Injectable()
export class ReferralService {
  constructor(
    @InjectRepository(AiUser)
    private readonly aiUserRepo: Repository<AiUser>,
  ) {}

  async getReferralStats(userId: number) {
    const user = await this.aiUserRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User #${userId} not found`);

    // Generate code if missing
    if (!user.referralCode) {
      user.referralCode = `REF-${user.name?.toUpperCase().substring(0, 3) || 'USR'}-${randomBytes(2).toString('hex').toUpperCase()}`;
      await this.aiUserRepo.save(user);
    }

    // Count referrals (only paid ones)
    const totalReferred = await this.aiUserRepo.count({
      where: { 
        referredBy: user.referralCode,
        subscriptionStatus: SubscriptionStatus.ACTIVE 
      },
    });

    // Calculate free months (Mock logic: logic moved to webhook actually)
    // Here we just return the stats
    return {
      referralCode: user.referralCode,
      totalReferred,
      isAmbassador: user.isAmbassador,
      freeMonthsPending: user.freeMonthsPending,
      currency: 'EUR',
    };
  }

  async applyReferralCode(userId: number, code: string) {
    const user = await this.aiUserRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User #${userId} not found`);

    if (user.referredBy) {
      throw new BadRequestException('User already referred');
    }

    // Check if code exists (and not self-referral)
    const referrer = await this.aiUserRepo.findOne({
      where: { referralCode: code },
    });
    if (!referrer) throw new NotFoundException('Invalid referral code');
    if (referrer.id === userId)
      throw new BadRequestException('Cannot refer yourself');

    // ─── Anti-circular referral ──────────────────────────────────────────────
    // If the potential referrer is already a filleul of the current user → block
    if (user.referralCode && referrer.referredBy === user.referralCode) {
      throw new BadRequestException(
        'Parrainage circulaire détecté : cet utilisateur est déjà ton filleul.',
      );
    }

    user.referredBy = code;
    await this.aiUserRepo.save(user);

    return { message: 'Referral code applied successfully' };
  }

  async getAllReferralStats() {
    const users = await this.aiUserRepo.find({
      select: [
        'id',
        'name',
        'email',
        'referralCode',
        'avatarUrl',
        'isAmbassador',
      ],
    });

    const results: any[] = [];

    for (const user of users) {
      if (!user.referralCode) continue;

      const totalReferred = await this.aiUserRepo.count({
        where: { 
          referredBy: user.referralCode,
          subscriptionStatus: SubscriptionStatus.ACTIVE 
        },
      });

      results.push({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
          isAmbassador: user.isAmbassador,
        },
        stats: {
          referralCode: user.referralCode,
          totalReferred,
          freeMonths: user.freeMonthsPending,
        },
      });
    }

    return results;
  }
}
