import { Module } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { ConfigModule } from '@nestjs/config';
import { AiPaymentModule } from '../ai-payment/ai-payment.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiUser } from '../ai/entities/ai-user.entity';
import { AiSubscriptionProfile } from '../profiles/entities/ai-subscription-profile.entity';
import { AiSubscription } from './entities/ai-subscription.entity';
import { AiCredit } from '../profiles/entities/ai-credit.entity';

@Module({
  imports: [
    ConfigModule,
    AiPaymentModule,
    TypeOrmModule.forFeature([
      AiUser,
      AiSubscriptionProfile,
      AiSubscription,
      AiCredit,
    ]),
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
})
export class SubscriptionsModule {}
