import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { AiUser } from '../ai/entities/ai-user.entity';
import { AiSubscriptionProfile, PlanType, SubscriptionStatus } from '../profiles/entities/ai-subscription-profile.entity';
import { AiCredit } from '../profiles/entities/ai-credit.entity';
import { AiGeneration, AiGenerationType } from '../ai/entities/ai-generation.entity';

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
    @InjectRepository(AiGeneration)
    private readonly aiGenRepo: Repository<AiGeneration>,
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
    user.aiProfile.planType = PlanType[selectedPlan.id.toUpperCase() as keyof typeof PlanType] || PlanType.BASIC;
    user.aiProfile.subscriptionStatus = SubscriptionStatus.ACTIVE;
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

  async getCredits(userId: number) {
    const user = await this.aiUserRepo.findOne({
      where: { id: userId },
      relations: ['aiProfile', 'aiProfile.aiCredit'],
    });

    if (!user?.aiProfile?.aiCredit) {
      throw new BadRequestException('Crédits utilisateur non trouvés');
    }

    const credit = user.aiProfile.aiCredit;
    // Compute usage counts since the credit was created (or since epoch as fallback)
    const sinceDate = credit.createdAt || new Date(0);

    const promptsUsed = await this.aiGenRepo.count({
      where: { user: { id: userId }, type: AiGenerationType.TEXT, createdAt: MoreThan(sinceDate) as any },
    }).catch(() => 0);

    const imagesUsed = await this.aiGenRepo.count({
      where: { user: { id: userId }, type: AiGenerationType.IMAGE, createdAt: MoreThan(sinceDate) as any },
    }).catch(() => 0);

    const videosUsed = await this.aiGenRepo.count({
      where: { user: { id: userId }, type: AiGenerationType.VIDEO, createdAt: MoreThan(sinceDate) as any },
    }).catch(() => 0);

    const audioUsed = await this.aiGenRepo.count({
      where: { user: { id: userId }, type: AiGenerationType.AUDIO, createdAt: MoreThan(sinceDate) as any },
    }).catch(() => 0);

    return {
      promptsLimit: credit.promptsLimit,
      imagesLimit: credit.imagesLimit,
      videosLimit: credit.videosLimit,
      audioLimit: credit.audioLimit,
      promptsUsed,
      imagesUsed,
      videosUsed,
      audioUsed,
      createdAt: credit.createdAt,
      updatedAt: credit.updatedAt,
    };
  }

  async decrementCredits(
    userId: number,
    generationType: AiGenerationType,
  ): Promise<any> {
    const user = await this.aiUserRepo.findOne({
      where: { id: userId },
      relations: ['aiProfile', 'aiProfile.aiCredit'],
    });

    if (!user?.aiProfile?.aiCredit) {
      throw new BadRequestException('Profil utilisateur ou crédits non trouvés');
    }

    const credit = user.aiProfile.aiCredit;
    
    // Map generation type to credit field
    let fieldName: keyof typeof credit;
    let limitFieldName: keyof typeof credit;

    switch (generationType) {
      case AiGenerationType.TEXT:
        fieldName = 'promptsLimit';
        limitFieldName = 'promptsLimit';
        break;
      case AiGenerationType.IMAGE:
        fieldName = 'imagesLimit';
        limitFieldName = 'imagesLimit';
        break;
      case AiGenerationType.VIDEO:
        fieldName = 'videosLimit';
        limitFieldName = 'videosLimit';
        break;
      case AiGenerationType.AUDIO:
        fieldName = 'audioLimit';
        limitFieldName = 'audioLimit';
        break;
      default:
        throw new BadRequestException(`Type de génération non supporté: ${generationType}`);
    }

    // Get current usage
    const sinceDate = credit.createdAt || new Date(0);
    let currentUsage = 0;

    switch (generationType) {
      case AiGenerationType.TEXT:
        currentUsage = await this.aiGenRepo.count({
          where: { user: { id: userId }, type: AiGenerationType.TEXT, createdAt: MoreThan(sinceDate) as any },
        }).catch(() => 0);
        break;
      case AiGenerationType.IMAGE:
        currentUsage = await this.aiGenRepo.count({
          where: { user: { id: userId }, type: AiGenerationType.IMAGE, createdAt: MoreThan(sinceDate) as any },
        }).catch(() => 0);
        break;
      case AiGenerationType.VIDEO:
        currentUsage = await this.aiGenRepo.count({
          where: { user: { id: userId }, type: AiGenerationType.VIDEO, createdAt: MoreThan(sinceDate) as any },
        }).catch(() => 0);
        break;
      case AiGenerationType.AUDIO:
        currentUsage = await this.aiGenRepo.count({
          where: { user: { id: userId }, type: AiGenerationType.AUDIO, createdAt: MoreThan(sinceDate) as any },
        }).catch(() => 0);
        break;
    }

    // Get the limit
    const limit = credit[limitFieldName] as number;

    // Check if limit reached (usage count is already incremented by ai.service.ts when saved)
    if (currentUsage >= limit) {
      throw new BadRequestException(
        `Limite atteinte pour les ${this.getTypeLabel(generationType)}. Vous avez utilisé ${limit}/${limit}.`,
      );
    }

    // Return remaining credits
    return {
      remaining: limit - currentUsage,
      used: currentUsage,
      limit: limit,
      type: generationType,
    };
  }

  private getTypeLabel(type: AiGenerationType): string {
    switch (type) {
      case AiGenerationType.TEXT:
        return 'textes/prompts';
      case AiGenerationType.IMAGE:
        return 'images';
      case AiGenerationType.VIDEO:
        return 'vidéos';
      case AiGenerationType.AUDIO:
        return 'audios';
      default:
        return 'contenus';
    }
  }
}
