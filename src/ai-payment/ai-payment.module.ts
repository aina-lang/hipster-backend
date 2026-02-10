import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiPaymentService } from './ai-payment.service';
import { AiPaymentController } from './ai-payment.controller';
import { AiPaymentWebhookController } from './ai-payment.webhook.controller';
import { AiUser } from '../ai/entities/ai-user.entity';
import { AiGeneration } from '../ai/entities/ai-generation.entity';
import { MailModule } from '../mail/mail.module';
import { TrialReminderService } from './trial-reminder.service';

@Module({
  imports: [TypeOrmModule.forFeature([AiUser, AiGeneration]), MailModule],
  controllers: [AiPaymentController, AiPaymentWebhookController],
  providers: [AiPaymentService, TrialReminderService],
  exports: [AiPaymentService],
})
export class AiPaymentModule {}
