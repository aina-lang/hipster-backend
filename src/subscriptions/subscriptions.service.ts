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
import { AiCredit } from '../profiles/entities/ai-credit.entity';

@Injectable()
export class SubscriptionsService {
  private stripe: Stripe;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(AiUser)
    private readonly aiUserRepo: Repository<AiUser>,
    @InjectRepository(AiSubscriptionProfile)
    private readonly subRepo: Repository<AiSubscriptionProfile>,
    @InjectRepository(AiCredit)
    private readonly aiCreditRepo: Repository<AiCredit>,
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
        planType: PlanType.CURIEUX,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      });
      const savedProfile = await this.subRepo.save(newProfile);

      const credit = this.aiCreditRepo.create({
        promptsLimit: 100,
        imagesLimit: 50,
        videosLimit: 10,
        audioLimit: 20,
        aiProfile: savedProfile,
      });
      await this.aiCreditRepo.save(credit);

      return savedProfile;
    }

    return profile;
  }

  async getPlans() {
    return [
      {
        id: 'curieux',
        name: 'Pack Curieux',
        price: 'Gratuit', // Frontend display logic might handle specific text like "7 jours gratuits"
        description: "Pour découvrir la puissance de l'IA",
        features: [
          "7 jours d'essai",
          '2 images / jour (Modèle Core)',
          '3 textes / jour',
          "Pas d'export",
        ],
        stripePriceId: null, // Free trial, no stripe init
      },
      {
        id: 'atelier',
        name: 'Atelier',
        price: 9.9, // Display logic handles the "then 17.90"
        description: 'Idéal pour démarrer',
        features: [
          'Génération de texte illimitée',
          'Génération d’image (SD 3.5 Turbo)',
          'Pas de vidéo / audio',
        ],
        stripePriceId: 'price_Atelier1790', // TODO: Make sure this ID exists in Stripe
      },
      {
        id: 'studio',
        name: 'Studio',
        price: 29.9,
        description: 'Pack orienté photo pro',
        features: [
          'Texte illimité',
          'Génération d’image (SD 3.5 Turbo)',
          'Optimisation image HD / 4K',
        ],
        stripePriceId: 'price_Studio2990',
        popular: true,
      },
      {
        id: 'agence',
        name: 'Agence',
        price: 69.99,
        description: 'Puissance Totale',
        features: [
          'Tout illimité',
          'Images Ultra Quality (Model Ultra)',
          'Création 3D (25/mois - Model Fast 3D)',
          'Vidéo & Audio inclus',
        ],
        stripePriceId: 'price_Agence6990',
      },
    ];
  }

  async createSubscription(userId: number, planId: string) {
    const plans = await this.getPlans();
    const selectedPlan = plans.find((p) => p.id === planId);

    if (!selectedPlan) {
      throw new BadRequestException('Plan invalide');
    }

    const user = await this.aiUserRepo.findOne({
      where: { id: userId },
      relations: ['aiProfile'],
    });

    if (!user) throw new BadRequestException('AiUser not found');

    // 1. Handle Free Pack "Curieux"
    if (planId === 'curieux') {
      let profile = user.aiProfile;
      if (!profile) {
        profile = this.subRepo.create({ aiUser: user });
      }

      profile.planType = PlanType.CURIEUX;
      profile.subscriptionStatus = SubscriptionStatus.ACTIVE; // Or TRIAL
      // Set limits or specific end date for trial if needed
      await this.subRepo.save(profile);

      return {
        message: 'Pack Curieux activé avec succès',
        subscriptionId: 'free-trial',
        clientSecret: null,
      };
    }

    // 2. Handle Paid Packs (Stripe)
    if (!selectedPlan.stripePriceId) {
      throw new BadRequestException(
        'Configuration de prix manquante pour ce plan payant',
      );
    }

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
        });
        const savedProfile = await this.subRepo.save(newProfile);
        const credit = this.aiCreditRepo.create({
          promptsLimit: 100,
          imagesLimit: 50,
          videosLimit: 10,
          audioLimit: 20,
          aiProfile: savedProfile,
        });
        await this.aiCreditRepo.save(credit);
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
      items: [{ price: selectedPlan.stripePriceId }],
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

  async createPaymentSheet(userId: number, priceId: string) {
    const plans = await this.getPlans();
    const selectedPlan = plans.find((p) => p.stripePriceId === priceId);

    if (!selectedPlan || !selectedPlan.stripePriceId) {
      throw new BadRequestException('Prix invalide');
    }

    const user = await this.aiUserRepo.findOne({
      where: { id: userId },
      relations: ['aiProfile'],
    });

    if (!user) throw new BadRequestException('AiUser not found');

    let customerId = user.aiProfile?.stripeCustomerId;

    // Create customer if not exists
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
        });
        const savedProfile = await this.subRepo.save(newProfile);
        const credit = this.aiCreditRepo.create({
          promptsLimit: 100,
          imagesLimit: 50,
          videosLimit: 10,
          audioLimit: 20,
          aiProfile: savedProfile,
        });
        await this.aiCreditRepo.save(credit);
      }
    }

    // Create ephemeral key for client
    const ephemeralKey = await this.stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2025-11-17.clover' },
    );

    // Create payment intent
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: this.getPriceInCents(selectedPlan.price),
      currency: 'eur',
      customer: customerId,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return {
      paymentIntentClientSecret: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customerId: customerId,
    };
  }

  private getPriceInCents(price: number | string): number {
    const priceNum = typeof price === 'string' ? parseFloat(price) : price;
    return Math.round(priceNum * 100);
  }
}
