import {
  Controller,
  Post,
  Headers,
  Req,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import {
  AiSubscriptionProfile,
  PlanType,
  SubscriptionStatus,
} from '../profiles/entities/ai-subscription-profile.entity';
import { Public } from '../common/decorators/public.decorator';

@Controller('ai/payment/webhook')
export class AiPaymentWebhookController {
  private stripe: Stripe;
  private readonly logger = new Logger(AiPaymentWebhookController.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(AiSubscriptionProfile)
    private readonly aiProfileRepo: Repository<AiSubscriptionProfile>,
  ) {
    const apiKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (apiKey) {
      this.stripe = new Stripe(apiKey, { apiVersion: '2025-11-17.clover' });
    }
  }

  @Public()
  @Post()
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: any,
  ) {
    if (!this.stripe) return;

    const webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        webhookSecret,
      );
    } catch (err) {
      this.logger.error(`Webhook Error: ${err.message}`);
      throw new BadRequestException(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
        );
        break;
      case 'invoice.payment_succeeded':
        // Optional: handle successful payments for logging or other logic
        break;
      default:
        this.logger.log(`Unhandled event type ${event.type}`);
    }

    return { received: true };
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    this.logger.log(
      `Subscription updated: ${subscription.id} status=${subscription.status}`,
    );

    const customerId =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id;

    const profile = await this.aiProfileRepo.findOne({
      where: { stripeCustomerId: customerId },
      relations: ['aiUser'],
    });

    if (!profile) {
      this.logger.warn(`No profile found for customer ${customerId}`);
      return;
    }

    // Check previous status vs current status
    // If it was trialing and now active, it means the user upgraded (or trial ended successfully)
    if (subscription.status === 'active') {
      // Check if we should upgrade the plan to STUDIO (if it was Curieux)
      if (profile.planType === PlanType.CURIEUX) {
        profile.planType = PlanType.STUDIO;
        this.logger.log(
          `Upgrading user ${profile.aiUser.id} to STUDIO after trial ended/activation.`,
        );
      }
      profile.subscriptionStatus = SubscriptionStatus.ACTIVE;
    } else if (subscription.status === 'trialing') {
      profile.subscriptionStatus = SubscriptionStatus.TRIAL;
    } else if (
      subscription.status === 'canceled' ||
      subscription.status === 'unpaid'
    ) {
      profile.subscriptionStatus = SubscriptionStatus.CANCELED;
    }

    // Update dates
    const sub = subscription as any;
    profile.subscriptionStartDate = new Date(sub.current_period_start * 1000);
    profile.subscriptionEndDate = new Date(sub.current_period_end * 1000);

    await this.aiProfileRepo.save(profile);
  }
}
