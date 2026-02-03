import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * Hipster Marketing Subscription Service
 * Handles payments for hipster-marketing application only
 */
@Injectable()
export class HipsterMarketingSubscriptionsService {
  private stripe: Stripe;

  constructor(private readonly configService: ConfigService) {
    const appConfig = this.configService.get('app');
    const apiKey = appConfig?.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
    if (apiKey) {
      this.stripe = new Stripe(apiKey, { apiVersion: '2025-11-17.clover' });
    }
  }

  async getPlans() {
    return [
      {
        id: 'starter',
        name: 'Starter',
        price: 29.9,
        description: 'Débutez vos campagnes marketing',
        features: ['10 campagnes', 'Rapport simple', 'Email support'],
        stripePriceId: 'price_starter_2990',
      },
      {
        id: 'professional',
        name: 'Professional',
        price: 99.9,
        description: 'Pour les agences en croissance',
        features: [
          'Campagnes illimitées',
          'Analyses avancées',
          'Priorité support',
        ],
        stripePriceId: 'price_professional_9990',
      },
    ];
  }
}
