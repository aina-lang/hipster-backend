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
  AiUser,
  PlanType,
  SubscriptionStatus,
} from '../ai/entities/ai-user.entity';
import { Public } from '../common/decorators/public.decorator';

@Controller('ai/payment/webhook')
export class AiPaymentWebhookController {
  private stripe: Stripe;
  private readonly logger = new Logger(AiPaymentWebhookController.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(AiUser)
    private readonly aiUserRepo: Repository<AiUser>,
  ) {
    const apiKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (apiKey) {
      this.stripe = new Stripe(apiKey, { apiVersion: '2024-06-20' as any });
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
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        );
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

    const user = await this.aiUserRepo.findOne({
      where: { stripeCustomerId: customerId },
    });

    if (!user) {
      this.logger.warn(`No user found for customer ${customerId}`);
      return;
    }

    // Check previous status vs current status
    // If it was trialing and now active, it means the user upgraded (or trial ended successfully)
    if (subscription.status === 'active') {
      // Check if we should upgrade the plan to ATELIER (if it was Curieux)
      if (user.planType === PlanType.CURIEUX) {
        user.planType = PlanType.ATELIER;
        this.logger.log(
          `Upgrading user ${user.id} to ATELIER after trial ended/activation.`,
        );
      }
      user.subscriptionStatus = SubscriptionStatus.ACTIVE;
    } else if (subscription.status === 'trialing') {
      user.subscriptionStatus = SubscriptionStatus.TRIAL;
    } else if (
      subscription.status === 'canceled' ||
      subscription.status === 'unpaid'
    ) {
      user.subscriptionStatus = SubscriptionStatus.CANCELED;
    }

    // Update dates
    const sub = subscription as any;
    user.subscriptionStartDate = new Date(sub.current_period_start * 1000);
    user.subscriptionEndDate = new Date(sub.current_period_end * 1000);

    await this.aiUserRepo.save(user);
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    this.logger.log(`Subscription deleted: ${subscription.id}`);

    const customerId =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id;

    const user = await this.aiUserRepo.findOne({
      where: { stripeCustomerId: customerId },
    });

    if (user) {
      user.subscriptionStatus = SubscriptionStatus.CANCELED;
      await this.aiUserRepo.save(user);
    }
  }
}
