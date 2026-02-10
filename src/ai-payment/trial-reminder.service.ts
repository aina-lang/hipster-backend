import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AiUser,
  PlanType,
  SubscriptionStatus,
} from '../ai/entities/ai-user.entity';
import { MailService } from '../mail/mail.service';

@Injectable()
export class TrialReminderService {
  private readonly logger = new Logger(TrialReminderService.name);

  constructor(
    @InjectRepository(AiUser)
    private readonly aiUserRepo: Repository<AiUser>,
    private readonly mailService: MailService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleTrialReminders() {
    this.logger.debug('Checking for trials ending in 24 hours...');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Window of 1 hour to avoid double sending or missing (since we run every hour)
    const startWindow = new Date(tomorrow);
    startWindow.setMinutes(0, 0, 0);
    startWindow.setMilliseconds(0);

    const endWindow = new Date(tomorrow);
    endWindow.setMinutes(59, 59, 999);

    const usersEndingSoon = await this.aiUserRepo.find({
      where: {
        planType: PlanType.CURIEUX,
        subscriptionStatus: SubscriptionStatus.TRIAL,
        subscriptionEndDate: Between(startWindow, endWindow),
      },
    });

    if (usersEndingSoon.length === 0) return;

    this.logger.log(
      `Found ${usersEndingSoon.length} users with trial ending in 24h.`,
    );

    for (const user of usersEndingSoon) {
      try {
        await this.mailService.sendEmail({
          to: user.email,
          subject: 'Fin de votre essai gratuit Hipster IA - Demain 🚀',
          template: 'trial-ending',
          context: {
            name: user.name || user.email,
            endDate: user.subscriptionEndDate.toLocaleDateString('fr-FR'),
            amount: '9,90€', // Transition to Atelier price
          },
        });
        this.logger.log(`Sent trial reminder email to ${user.email}`);
      } catch (error) {
        this.logger.error(
          `Failed to send trial reminder to ${user.email}`,
          error,
        );
      }
    }
  }
}
