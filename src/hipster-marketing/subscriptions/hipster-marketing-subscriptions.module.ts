import { Module } from '@nestjs/common';
import { HipsterMarketingSubscriptionsService } from './hipster-marketing-subscriptions.service';
import { ConfigModule } from '@nestjs/config';

/**
 * Hipster Marketing Subscriptions Module
 * Handles all payment and subscription logic for hipster-marketing application
 */
@Module({
  imports: [ConfigModule],
  providers: [HipsterMarketingSubscriptionsService],
  exports: [HipsterMarketingSubscriptionsService],
})
export class HipsterMarketingSubscriptionsModule {}
