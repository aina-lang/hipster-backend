import {
  Controller,
  Post,
  Headers,
  Req,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
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
import { AiPaymentService } from './ai-payment.service';

@Controller('ai/payment/webhook')
export class AiPaymentWebhookController {
  private stripe: Stripe;
  private readonly logger = new Logger(AiPaymentWebhookController.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(AiUser)
    private readonly aiUserRepo: Repository<AiUser>,
    @Inject(forwardRef(() => AiPaymentService))
    private readonly aiPaymentService: AiPaymentService,
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
    if (!this.stripe) {
      this.logger.warn('Stripe client not configured; webhook ignored');
      return { received: false };
    }

    const webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
    if (!webhookSecret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET is missing');
      throw new BadRequestException('Webhook not configured');
    }

    const rawBody = req.rawBody;
    if (!rawBody || (Buffer.isBuffer(rawBody) && rawBody.length === 0)) {
      this.logger.error(
        'Webhook: missing rawBody (check express json verify in main.ts). URL must be POST https://<host>/api/ai/payment/webhook',
      );
      throw new BadRequestException('Invalid webhook payload');
    }

    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );
      this.logger.log(`Stripe webhook received: ${event.type} id=${event.id}`);
    } catch (err) {
      this.logger.error(`Webhook signature verification failed: ${err.message}`);
      throw new BadRequestException(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
        );
        break;
      case 'invoice.payment_succeeded':
        await this.handleInvoiceSucceeded(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        );
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
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

    // Use the optimized sync method to handle plan upgrades and state updates
    await this.aiPaymentService.syncWithStripe(user.id);

    // Handle referral rewards specifically for webhooks to avoid redundant processing in cron
    if (subscription.status === 'active' && user.planType === PlanType.CURIEUX && user.referredBy) {
      await this.handleReferralReward(user.referredBy);
    }
  }

  private async handleInvoiceSucceeded(invoice: Stripe.Invoice) {
    this.logger.log(`Invoice succeeded: ${invoice.id} for customer ${invoice.customer}`);

    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
    if (!customerId) return;

    const user = await this.aiUserRepo.findOne({
      where: { stripeCustomerId: customerId },
    });

    if (!user) return;

    // We only care about subscription invoices for discount tracking
    if (!(invoice as any).subscription) return;

    // Increment discount months if user was referred
    if (user.referredBy) {
      user.discountMonthsCount += 1;
      this.logger.log(`User ${user.id} discount month count: ${user.discountMonthsCount}`);

      // If it reaches 3 months and it's a Studio plan, we must revert to normal pricing
      // unless they are an Ambassador.
      if (user.discountMonthsCount >= 3 && user.planType === PlanType.STUDIO && !user.isAmbassador) {
        this.logger.log(`Reverting user ${user.id} Studio plan to normal price.`);
        
        try {
          const subscription = await this.stripe.subscriptions.retrieve((invoice as any).subscription as string);
          
          // Find the normal Studio price
          const plans = await this.aiPaymentService.getPlans(false, 3, false);
          const normalStudioPriceId = plans.find(p => p.id === 'studio')?.stripePriceId;

          if (normalStudioPriceId) {
            await this.stripe.subscriptions.update((invoice as any).subscription as string, {
              items: [{
                id: subscription.items.data[0].id,
                price: normalStudioPriceId,
              }],
              proration_behavior: 'none',
            });
            this.logger.log(`Subscription ${subscription.id} updated to normal Studio price.`);
          }
        } catch (error) {
          this.logger.error(`Failed to revert Studio price for user ${user.id}: ${error.message}`);
        }
      }
    }

    await this.aiUserRepo.save(user);
  }

  private async handleReferralReward(referralCode: string) {
    const referrer = await this.aiUserRepo.findOne({
      where: { referralCode },
    });

    if (!referrer) {
      this.logger.warn(`Referrer with code ${referralCode} not found.`);
      return;
    }

    // Check if referrer already got a free month this month
    const now = new Date();
    const canGetFreeMonth = !referrer.lastFreeMonthAppliedAt || 
      referrer.lastFreeMonthAppliedAt.getMonth() !== now.getMonth() ||
      referrer.lastFreeMonthAppliedAt.getFullYear() !== now.getFullYear();

    if (canGetFreeMonth) {
      referrer.freeMonthsPending += 1;
      referrer.lastFreeMonthAppliedAt = now;
      this.logger.log(`User ${referrer.id} earned 1 free month from referral.`);
    } else {
      this.logger.log(`User ${referrer.id} already received a free month this month. Referral tracked but no extra month added.`);
    }

    // Check for Ambassador Status (10+ paid referrals)
    const paidReferralsCount = await this.aiUserRepo.count({
      where: { 
        referredBy: referralCode,
        subscriptionStatus: SubscriptionStatus.ACTIVE 
      },
    });

    if (paidReferralsCount >= 10 && !referrer.isAmbassador) {
      referrer.isAmbassador = true;
      this.logger.log(`User ${referrer.id} promoted to Ambassador!`);
    }

    await this.aiUserRepo.save(referrer);
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

      // Send Subscription Cancelled Email
      try {
        await this.aiPaymentService.sendSubscriptionCancelledEmail(user);
      } catch (e) {
        this.logger.error(
          `Failed to send cancellation email to ${user.email}`,
          e.message,
        );
      }
    }
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice) {
    this.logger.log(`Payment failed for invoice: ${invoice.id}`);

    const customerId =
      typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id;

    if (!customerId) {
      this.logger.warn('No customer ID found in invoice');
      return;
    }

    const user = await this.aiUserRepo.findOne({
      where: { stripeCustomerId: customerId },
    });

    if (!user) {
      this.logger.warn(`No user found for customer ${customerId}`);
      return;
    }

    // Update status to PAST_DUE if not already
    if (user.subscriptionStatus !== SubscriptionStatus.PAST_DUE) {
      user.subscriptionStatus = SubscriptionStatus.PAST_DUE;
      await this.aiUserRepo.save(user);
      this.logger.log(`User ${user.id} status updated to PAST_DUE`);
    }

    // Send payment failed email
    try {
      await this.aiPaymentService.sendPaymentFailedEmail(user, invoice);
      this.logger.log(`Payment failed email sent to ${user.email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send payment failed email: ${error.message}`,
      );
    }
  }
}
