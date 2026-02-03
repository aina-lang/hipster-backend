import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { InjectRepository } from '@nestjs/typeorm';
import { AiUser } from '../../ai/entities/ai-user.entity';
import { Repository } from 'typeorm';
import {
  AiSubscriptionProfile,
  PlanType,
  SubscriptionStatus,
} from '../../profiles/entities/ai-subscription-profile.entity';

/**
 * Hipsteria IA Subscription Service
 * Handles payments for hipsteria-ia application only
 */
@Injectable()
export class HipsteriaSubscriptionsService {
  private stripe: Stripe;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(AiUser)
    private readonly aiUserRepo: Repository<AiUser>,
    @InjectRepository(AiSubscriptionProfile)
    private readonly subRepo: Repository<AiSubscriptionProfile>,
  ) {
    const appConfig = this.configService.get('app');
    const apiKey = appConfig?.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
    if (apiKey) {
      this.stripe = new Stripe(apiKey, { apiVersion: '2025-11-17.clover' });
    }
  }

  async getSubscriptionProfile(userId: number): Promise<AiSubscriptionProfile> {
    const profile = await this.subRepo.findOne({
      where: { aiUser: { id: userId } },
      relations: ['subscriptions'],
    });

    if (!profile) {
      const user = await this.aiUserRepo.findOneBy({ id: userId });
      if (!user) throw new BadRequestException('AiUser not found');

      const newProfile = this.subRepo.create({
        aiUser: user,
        credits: 10,
        planType: PlanType.CURIEUX,
        subscriptionStatus: SubscriptionStatus.TRIAL,
      });
      return this.subRepo.save(newProfile);
    }

    return profile;
  }

  async getPlans() {
    return [
      {
        id: 'curieux',
        name: 'Pack Curieux',
        price: 0,
        description: 'Découvrez Hipster sans engagement (7 jours)',
        features: [
          '2 images/jour',
          '3 textes/jour',
          "Pas d'export",
          'Consultation uniquement',
        ],
        stripePriceId: null,
      },
      {
        id: 'atelier',
        name: 'Atelier',
        price: 17.9,
        description: "L'essentiel pour les créateurs",
        features: [
          '100 images/mois',
          'Texte illimité',
          'Pas de vidéo',
          'Choix du canal',
        ],
        stripePriceId: 'price_Atelier1790',
      },
      {
        id: 'studio',
        name: 'Studio',
        price: 29.9,
        description: 'Pour les productions régulières',
        features: [
          '100 images/mois',
          'Texte illimité',
          '3 vidéos',
          'Support prioritaire',
        ],
        stripePriceId: 'price_Studio2990',
      },
      {
        id: 'agence',
        name: 'Agence',
        price: 69.9,
        description: 'La puissance totale',
        features: [
          '300 images/mois',
          'Texte illimité',
          '10 vidéos',
          '60 sons',
        ],
        stripePriceId: 'price_Agence6990',
      },
    ];
  }

  async createSubscription(userId: number, planId: string) {
    const user = await this.aiUserRepo.findOne({
      where: { id: userId },
      relations: ['aiProfile'],
    });

    if (!user) throw new BadRequestException('AiUser not found');

    let customerId = user.aiProfile?.stripeCustomerId;

    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id.toString(), app: 'hipsteria-ia' },
      });
      customerId = customer.id;

      if (user.aiProfile) {
        user.aiProfile.stripeCustomerId = customerId;
        await this.subRepo.save(user.aiProfile);
      } else {
        const newProfile = this.subRepo.create({
          aiUser: user,
          stripeCustomerId: customerId,
          credits: 10,
        });
        await this.subRepo.save(newProfile);
      }
    }

    const subscription = await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: planId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: { app: 'hipsteria-ia' },
    });

    return {
      subscriptionId: subscription.id,
      clientSecret: (subscription.latest_invoice as any).payment_intent
        .client_secret,
    };
  }
}
