import { Module } from '@nestjs/common';
import { HipsteriaSubscriptionsService } from './hipsteria-subscriptions.service';
import { HipsteriaSubscriptionsController } from './hipsteria-subscriptions.controller';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiUser } from 'src/ai/entities/ai-user.entity';
import { AiSubscriptionProfile } from 'src/profiles/entities/ai-subscription-profile.entity';

/**
 * Hipsteria IA Subscriptions Module
 * Handles all payment and subscription logic for hipsteria-ia application
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([AiUser, AiSubscriptionProfile]),
  ],
  controllers: [HipsteriaSubscriptionsController],
  providers: [HipsteriaSubscriptionsService],
  exports: [HipsteriaSubscriptionsService],
})
export class HipsteriaSubscriptionsModule {}
