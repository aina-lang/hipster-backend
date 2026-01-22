import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { InjectRepository } from '@nestjs/typeorm';
import { AiUser } from '../ai/entities/ai-user.entity';
import { Repository } from 'typeorm';
import {
  AiSubscriptionProfile,
  PlanType,
  SubscriptionStatus,
} from '../profiles/entities/ai-subscription-profile.entity';

@Injectable()
export class SubscriptionsService {
  private stripe: Stripe;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(AiUser)
    private readonly aiUserRepo: Repository<AiUser>,
    @InjectRepository(AiSubscriptionProfile)
    private readonly subRepo: Repository<AiSubscriptionProfile>,
  ) {
    const apiKey = this.configService.get<string>('STRIPE_SECRET_KEY');
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
      // Create a default free profile if none exists
      const user = await this.aiUserRepo.findOneBy({ id: userId });
      if (!user) throw new BadRequestException('AiUser not found');

      const newProfile = this.subRepo.create({
        aiUser: user,
        credits: 10,
        planType: PlanType.BASIC,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
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
        features: [
          "7 jours d'essai",
          '2 images / jour',
          '3 textes / jour',
          "Pas d'export / téléchargement",
        ],
        stripePriceId: null,
      },
      {
        id: 'atelier',
        name: 'Atelier',
        price: 17.9,
        features: [
          '100 images / mois',
          'Texte illimité',
          'Pas de vidéo / audio',
          'Choix du canal',
        ],
        stripePriceId: 'price_Atelier1790',
      },
      {
        id: 'studio',
        name: 'Studio',
        price: 29.9,
        features: [
          '100 images / mois',
          'Texte illimité',
          '3 vidéos / mois',
          'Support prioritaire',
        ],
        stripePriceId: 'price_Studio2990',
      },
      {
        id: 'agence',
        name: 'Agence',
        price: 69.9,
        features: [
          '300 images / mois',
          'Texte illimité',
          '60 sons / mois',
          '10 vidéos / mois',
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
        metadata: { userId: user.id.toString() },
      });
      customerId = customer.id;

      // Update or create profile
      if (user.aiProfile) {
        user.aiProfile.stripeCustomerId = customerId;
        await this.subRepo.save(user.aiProfile);
      } else {
        const newProfile = this.subRepo.create({
          aiUser: user,
          stripeCustomerId: customerId,
          credits: 10, // Free credits
        });
        await this.subRepo.save(newProfile);
      }
    }

    // Check referrals for discount
    const referralCount = await this.aiUserRepo.count({
      where: { id: userId },
    });

    let coupon: string | undefined = undefined;
    if (referralCount >= 2) {
      coupon = 'FREE_MONTH_REFERRAL';
    } else if (referralCount === 1) {
      coupon = 'HALF_OFF_REFERRAL';
    }

    const subscription = await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: planId }],
      discounts: coupon ? [{ coupon }] : undefined,
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    });

    return {
      subscriptionId: subscription.id,
      clientSecret: (subscription.latest_invoice as any).payment_intent
        .client_secret,
    };
  }
}
