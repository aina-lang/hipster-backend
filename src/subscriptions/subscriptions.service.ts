import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Repository } from 'typeorm';
import { AiSubscriptionProfile } from '../profiles/entities/ai-subscription-profile.entity';

@Injectable()
export class SubscriptionsService {
  private stripe: Stripe;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AiSubscriptionProfile)
    private readonly subRepo: Repository<AiSubscriptionProfile>,
  ) {
    const apiKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (apiKey) {
      this.stripe = new Stripe(apiKey, { apiVersion: '2025-11-17.clover' });
    }
  }

  async createSubscription(userId: number, planId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['aiProfile'],
    });

    if (!user) throw new BadRequestException('User not found');

    let customerId = user.aiProfile?.stripeCustomerId;

    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id.toString() },
      });
      customerId = customer.id;

      // Update or create profile
      if (user.aiProfile) {
        user.aiProfile.stripeCustomerId = customerId;
        await this.subRepo.save(user.aiProfile);
      } else {
        const newProfile = this.subRepo.create({
          user,
          stripeCustomerId: customerId,
          credits: 10, // Free credits
        });
        await this.subRepo.save(newProfile);
      }
    }

    // Check referrals for discount
    const referralCount = await this.userRepo.count({
      where: { referredBy: user.id.toString() },
    });

    let coupon: string | undefined = undefined;
    if (referralCount >= 2) {
      // 1 month free
      // In real stripe, you'd create a coupon or use a predefined one
      coupon = 'FREE_MONTH_REFERRAL';
    } else if (referralCount === 1) {
      // 50% off
      coupon = 'HALF_OFF_REFERRAL';
    }

    const subscription = await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: planId }],
      discounts: coupon ? [{ coupon }] : undefined,
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });

    return {
      subscriptionId: subscription.id,
      clientSecret: (subscription.latest_invoice as any).payment_intent
        .client_secret,
    };
  }
}
