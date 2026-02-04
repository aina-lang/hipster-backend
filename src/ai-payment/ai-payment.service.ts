import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiUser } from '../ai/entities/ai-user.entity';
import { AiSubscriptionProfile } from '../profiles/entities/ai-subscription-profile.entity';
import { AiCredit } from '../profiles/entities/ai-credit.entity';

@Injectable()
export class AiPaymentService {
  private stripe: Stripe;
  private readonly logger = new Logger(AiPaymentService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(AiUser)
    private readonly aiUserRepo: Repository<AiUser>,
    @InjectRepository(AiSubscriptionProfile)
    private readonly aiProfileRepo: Repository<AiSubscriptionProfile>,
    @InjectRepository(AiCredit)
    private readonly aiCreditRepo: Repository<AiCredit>,
  ) {
    const apiKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (apiKey) {
      this.stripe = new Stripe(apiKey, { apiVersion: '2025-11-17.clover' });
    }
  }

  private getPlans() {
    return [
      {
        id: 'curieux',
        name: 'Pack Curieux',
        price: 0,
        stripePriceId: null,
        promptsLimit: 100,
        imagesLimit: 50,
        videosLimit: 10,
        audioLimit: 20,
      },
      {
        id: 'atelier',
        name: 'Atelier',
        price: 9.9,
        stripePriceId: 'price_Atelier1790',
        promptsLimit: 500,
        imagesLimit: 100,
        videosLimit: 0,
        audioLimit: 0,
      },
      {
        id: 'studio',
        name: 'Studio',
        price: 29.9,
        stripePriceId: 'price_Studio2990',
        promptsLimit: 1000,
        imagesLimit: 100,
        videosLimit: 3,
        audioLimit: 0,
      },
      {
        id: 'agence',
        name: 'Agence',
        price: 69.99,
        stripePriceId: 'price_Agence6990',
        promptsLimit: 9999,
        imagesLimit: 300,
        videosLimit: 10,
        audioLimit: 60,
      },
    ];
  }

  private getPriceInCents(price: number | string): number {
    const priceNum = typeof price === 'string' ? parseFloat(price) : price;
    return Math.round(priceNum * 100);
  }

  async createPaymentSheet(userId: number, priceId: string) {
    const plans = this.getPlans();
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
        await this.aiProfileRepo.save(user.aiProfile);
      } else {
        const newProfile = this.aiProfileRepo.create({
          aiUser: user,
          stripeCustomerId: customerId,
        });
        const saved = await this.aiProfileRepo.save(newProfile);
        const credit = this.aiCreditRepo.create({
          promptsLimit: 100,
          imagesLimit: 50,
          videosLimit: 10,
          audioLimit: 20,
          aiProfile: saved,
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

  async confirmPlan(userId: number, planId: string) {
    const plans = this.getPlans();
    const selectedPlan = plans.find((p) => p.id === planId);

    if (!selectedPlan) {
      throw new BadRequestException('Plan invalide');
    }

    // Get user and profile
    const user = await this.aiUserRepo.findOne({
      where: { id: userId },
      relations: ['aiProfile', 'aiProfile.aiCredit'],
    });

    if (!user?.aiProfile) {
      throw new BadRequestException('Profil utilisateur non trouvé');
    }

    // Update or create AiCredit with plan limits
    let credit = user.aiProfile.aiCredit;
    if (!credit) {
      credit = this.aiCreditRepo.create({
        aiProfile: user.aiProfile,
      });
    }

    // Apply plan limits
    credit.promptsLimit = selectedPlan.promptsLimit;
    credit.imagesLimit = selectedPlan.imagesLimit;
    credit.videosLimit = selectedPlan.videosLimit;
    credit.audioLimit = selectedPlan.audioLimit;

    await this.aiCreditRepo.save(credit);

    // Update profile with plan type and subscription status
    user.aiProfile.planType = planId;
    user.aiProfile.subscriptionStatus = 'active';
    await this.aiProfileRepo.save(user.aiProfile);

    this.logger.log(`Plan confirmed for user ${userId}: ${planId} with limits ${JSON.stringify(selectedPlan)}`);

    return {
      message: 'Plan confirmé avec succès',
      planId: selectedPlan.id,
      limits: {
        promptsLimit: credit.promptsLimit,
        imagesLimit: credit.imagesLimit,
        videosLimit: credit.videosLimit,
        audioLimit: credit.audioLimit,
      },
    };
  }
}
