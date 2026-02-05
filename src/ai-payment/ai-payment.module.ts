import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiPaymentService } from './ai-payment.service';
import { AiPaymentController } from './ai-payment.controller';
import { AiUser } from '../ai/entities/ai-user.entity';
import { AiSubscriptionProfile } from '../profiles/entities/ai-subscription-profile.entity';
import { AiCredit } from '../profiles/entities/ai-credit.entity';
import { AiGeneration } from '../ai/entities/ai-generation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiUser,
      AiSubscriptionProfile,
      AiCredit,
      AiGeneration,
    ]),
  ],
  controllers: [AiPaymentController],
  providers: [AiPaymentService],
  exports: [AiPaymentService],
})
export class AiPaymentModule {}
