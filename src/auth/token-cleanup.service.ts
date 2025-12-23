import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { User } from 'src/users/entities/user.entity';

@Injectable()
export class TokenCleanupService {
  private readonly logger = new Logger(TokenCleanupService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleTokenCleanup() {
    const now = new Date();
    const expiredUsers = await this.userRepo.find({
      where: {
        refreshTokenExpiresAt: LessThan(now),
      },
    });

    if (expiredUsers.length > 0) {
      for (const user of expiredUsers) {
        await this.userRepo.update(user.id, {
          refreshToken: null,
          refreshTokenExpiresAt: null,
        });
      }
      this.logger.log(
        `🧹 ${expiredUsers.length} refreshTokens expirés nettoyés.`,
      );
    } else {
      this.logger.log('✅ Aucun token expiré à nettoyer.');
    }
  }
}
