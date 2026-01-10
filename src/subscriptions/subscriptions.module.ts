import { Module } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiUser } from '../ai/entities/ai-user.entity';
import { AiSubscriptionProfile } from '../profiles/entities/ai-subscription-profile.entity';
import { AiSubscription } from './entities/ai-subscription.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([AiUser, AiSubscriptionProfile, AiSubscription]),
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
})
export class SubscriptionsModule {}
