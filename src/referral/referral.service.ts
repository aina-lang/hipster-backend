import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { randomBytes } from 'crypto';

@Injectable()
export class ReferralService {
    constructor(
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
    ) { }

    async getReferralStats(userId: number) {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException(`User #${userId} not found`);

        // Generate code if missing
        if (!user.referralCode) {
            user.referralCode = `REF-${user.firstName.toUpperCase().substring(0, 3)}-${randomBytes(2).toString('hex').toUpperCase()}`;
            await this.userRepo.save(user);
        }

        // Count referrals
        const totalReferred = await this.userRepo.count({
            where: { referredBy: user.referralCode },
        });

        // Calculate earnings (Mock logic: 50€ per referral)
        const earnings = totalReferred * 50;

        return {
            referralCode: user.referralCode,
            totalReferred,
            earnings,
            currency: 'EUR',
        };
    }

    async applyReferralCode(userId: number, code: string) {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException(`User #${userId} not found`);

        if (user.referredBy) {
            throw new BadRequestException('User already referred');
        }

        // Check if code exists (and not self-referral)
        const referrer = await this.userRepo.findOne({ where: { referralCode: code } });
        if (!referrer) throw new NotFoundException('Invalid referral code');
        if (referrer.id === userId) throw new BadRequestException('Cannot refer yourself');

        user.referredBy = code;
        await this.userRepo.save(user);

        return { message: 'Referral code applied successfully' };
    }

    async getAllReferralStats() {
        // Get all users who have a referral code or are clients
        const users = await this.userRepo.find({
            select: ['id', 'firstName', 'lastName', 'email', 'referralCode', 'avatarUrl'],
        });

        const results: any[] = [];

        for (const user of users) {
            // If user has no referral code, skip or show 0
            if (!user.referralCode) continue;

            const totalReferred = await this.userRepo.count({
                where: { referredBy: user.referralCode },
            });

            results.push({
                user: {
                    id: user.id,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    avatarUrl: user.avatarUrl,
                },
                stats: {
                    referralCode: user.referralCode,
                    totalReferred,
                    earnings: totalReferred * 50,
                    currency: 'EUR',
                },
            });
        }

        return results;
    }
}
