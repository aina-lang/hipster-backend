import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private stripe: Stripe;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('STRIPE_SECRET');
    if (apiKey) {
      this.stripe = new Stripe(apiKey, {
        apiVersion: '2025-11-17.clover',
      });
    } else {
      console.error('STRIPE_SECRET_KEY is not defined in environment variables');
    }
  }

  private checkStripe() {
    if (!this.stripe) {
      throw new Error(
        'Stripe is not configured. Please check STRIPE_SECRET_KEY in your .env file.',
      );
    }
  }

  async createPaymentIntent(params: {
    amount: number;
    currency: string;
    metadata?: Record<string, string>;
    customerId?: string;
  }) {
    this.checkStripe();
    return this.stripe.paymentIntents.create({
      amount: Math.round(params.amount * 100), // Convert to cents
      currency: params.currency.toLowerCase(),
      metadata: params.metadata,
      customer: params.customerId,
      automatic_payment_methods: {
        enabled: true,
      },
    });
  }

  async constructEvent(payload: Buffer, signature: string, secret: string) {
    this.checkStripe();
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }

  get instance(): Stripe {
    return this.stripe;
  }
}
