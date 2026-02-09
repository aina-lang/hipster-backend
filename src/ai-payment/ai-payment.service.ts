import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, Raw } from 'typeorm';
import {
  AiUser,
  PlanType,
  SubscriptionStatus,
} from '../ai/entities/ai-user.entity';
import {
  AiGeneration,
  AiGenerationType,
} from '../ai/entities/ai-generation.entity';

@Injectable()
export class AiPaymentService {
  private stripe: Stripe;
  private readonly logger = new Logger(AiPaymentService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(AiUser)
    private readonly aiUserRepo: Repository<AiUser>,
    @InjectRepository(AiGeneration)
    private readonly aiGenRepo: Repository<AiGeneration>,
  ) {
    const apiKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (apiKey) {
      this.stripe = new Stripe(apiKey, { apiVersion: '2025-11-17.clover' });
    }
  }

  public async getPlans() {
    // Count active subscribers (excluding Curieux)
    const activeSubscribersCount = await this.aiUserRepo.count({
      where: {
        planType: Raw((alias) => `${alias} != 'curieux'`),
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      },
    });

    const isEarlyBird = activeSubscribersCount < 30;
    const atelierPrice = isEarlyBird ? 9.9 : 17.9;
    const atelierPriceId = isEarlyBird
      ? 'price_Atelier990'
      : 'price_Atelier1790';

    return [
      {
        id: 'curieux',
        name: 'Curieux',
        price: 'Gratuit',
        stripePriceId: 'price_Studio2990',
        promptsLimit: 2,
        imagesLimit: 2,
        videosLimit: 0,
        audioLimit: 0,
        threeDLimit: 0,
        description: '7 jours gratuits',
        features: [
          '2 textes / jour',
          '2 images / jour',
          'Pas d’export',
          "Accompagnement de l'agence",
        ],
      },
      {
        id: 'atelier',
        name: 'Atelier',
        price: atelierPrice,
        stripePriceId: atelierPriceId,
        promptsLimit: 999999,
        imagesLimit: 100,
        videosLimit: 0,
        audioLimit: 0,
        threeDLimit: 0,
        description: isEarlyBird
          ? '9,90€ 30 premiers - ensuite 17,90€ / mois'
          : 'L’essentiel pour créer',
        features: [
          'Génération de texte',
          "Génération d'image",
          "Accompagnement de l'agence",
        ],
      },
      {
        id: 'studio',
        name: 'Studio',
        price: 29.9,
        stripePriceId: 'price_Studio2990',
        promptsLimit: 999999,
        imagesLimit: 100,
        videosLimit: 0,
        audioLimit: 0,
        threeDLimit: 0,
        description: 'Orienté photo',
        features: [
          'Génération de texte',
          "Génération d'image",
          'Optimisation image HD / 4K',
          "Accompagnement de l'agence",
        ],
        popular: true,
      },
      {
        id: 'agence',
        name: 'Agence',
        price: 69.99,
        stripePriceId: 'price_Agence6990',
        promptsLimit: 999999,
        imagesLimit: 300,
        videosLimit: 10,
        audioLimit: 60,
        threeDLimit: 25,
        description: 'Puissance maximale',
        features: [
          'Génération de texte',
          "Génération d'image",
          'Optimisation image HD / 4K',
          'Création vidéo',
          'Création sonore',
          '25 générations 3D/Sketch',
          "Accompagnement de l'agence",
        ],
      },
    ];
  }

  async getPlansForUser(userId: number) {
    const plans = await this.getPlans();
    const user = await this.aiUserRepo.findOneBy({ id: userId });

    if (!user) return plans;

    return plans.filter((p) => {
      if (p.id === 'curieux') {
        return !user.hasUsedTrial;
      }
      return true;
    });
  }

  async getSubscriptionProfile(userId: number): Promise<AiUser> {
    const user = await this.aiUserRepo.findOneBy({ id: userId });
    if (!user) throw new BadRequestException('AiUser not found');
    return user;
  }

  private getPriceInCents(price: number | string): number {
    const priceNum = typeof price === 'string' ? parseFloat(price) : price;
    return Math.round(priceNum * 100);
  }

  async createPaymentSheet(userId: number, priceId?: string, planId?: string) {
    const plans = await this.getPlans();
    let selectedPlan;

    if (planId === 'curieux') {
      selectedPlan = plans.find((p) => p.id === 'curieux');
    } else {
      selectedPlan = planId
        ? plans.find((p) => p.id === planId)
        : plans.find((p) => p.stripePriceId === priceId);
    }

    if (!selectedPlan) throw new BadRequestException('Prix invalide');

    const user = await this.aiUserRepo.findOneBy({ id: userId });
    if (!user) throw new BadRequestException('AiUser not found');

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id.toString() },
      });
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await this.aiUserRepo.save(user);
    }

    const ephemeralKey = await this.stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2025-11-17.clover' },
    );

    if (selectedPlan.id === 'curieux') {
      if (user.hasUsedTrial) {
        throw new BadRequestException('Essai gratuit déjà utilisé');
      }

      const setupIntent = await this.stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
        usage: 'off_session',
        metadata: { userId: userId.toString(), planId: 'curieux' },
      });

      return {
        setupIntentClientSecret: setupIntent.client_secret,
        ephemeralKey: ephemeralKey.secret,
        customerId: customerId,
      };
    }

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: this.getPriceInCents(selectedPlan.price),
      currency: 'eur',
      customer: customerId,
      automatic_payment_methods: { enabled: true },
    });

    return {
      paymentIntentClientSecret: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customerId: customerId,
    };
  }

  async confirmPlan(userId: number, planId: string) {
    const plans = await this.getPlans();
    const selectedPlan = plans.find((p) => p.id === planId);
    if (!selectedPlan) throw new BadRequestException('Plan invalide');

    const user = await this.aiUserRepo.findOneBy({ id: userId });
    if (!user) throw new BadRequestException('Utilisateur non trouvé');

    // Apply plan limits and data directly to user
    user.promptsLimit = selectedPlan.promptsLimit;
    user.imagesLimit = selectedPlan.imagesLimit;
    user.videosLimit = selectedPlan.videosLimit;
    user.audioLimit = selectedPlan.audioLimit;
    user.threeDLimit = selectedPlan.threeDLimit;

    user.planType =
      PlanType[selectedPlan.id.toUpperCase() as keyof typeof PlanType] ||
      PlanType.CURIEUX;

    const startDate = new Date();
    const endDate = new Date();

    if (selectedPlan.id === 'curieux') {
      endDate.setDate(endDate.getDate() + 7);
      user.subscriptionStatus = SubscriptionStatus.TRIAL;
      user.hasUsedTrial = true;
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
      user.subscriptionStatus = SubscriptionStatus.ACTIVE;
    }

    user.subscriptionStartDate = startDate;
    user.subscriptionEndDate = endDate;

    await this.aiUserRepo.save(user);

    this.logger.log(`Plan confirmed for user ${userId}: ${planId}`);

    return {
      message: 'Plan confirmé avec succès',
      planId: selectedPlan.id,
      limits: {
        promptsLimit: user.promptsLimit,
        imagesLimit: user.imagesLimit,
        videosLimit: user.videosLimit,
        audioLimit: user.audioLimit,
        threeDLimit: user.threeDLimit,
      },
    };
  }

  async getCredits(userId: number) {
    const user = await this.aiUserRepo.findOneBy({ id: userId });
    if (!user) throw new BadRequestException('Utilisateur non trouvé');

    const plan = user.planType || PlanType.CURIEUX;

    let sinceDate: Date;
    if (plan === PlanType.CURIEUX) {
      sinceDate = new Date();
      sinceDate.setHours(0, 0, 0, 0);
    } else {
      sinceDate =
        user.subscriptionStartDate ||
        new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    }

    const usage = await Promise.all([
      this.aiGenRepo.count({
        where: {
          user: { id: userId },
          type: AiGenerationType.TEXT,
          createdAt: MoreThan(sinceDate) as any,
        },
      }),
      this.aiGenRepo.count({
        where: {
          user: { id: userId },
          type: AiGenerationType.IMAGE,
          createdAt: MoreThan(sinceDate) as any,
        },
      }),
      this.aiGenRepo.count({
        where: {
          user: { id: userId },
          type: AiGenerationType.VIDEO,
          createdAt: MoreThan(sinceDate) as any,
        },
      }),
      this.aiGenRepo.count({
        where: {
          user: { id: userId },
          type: AiGenerationType.AUDIO,
          createdAt: MoreThan(sinceDate) as any,
        },
      }),
    ]);

    return {
      promptsLimit: user.promptsLimit,
      imagesLimit: user.imagesLimit,
      videosLimit: user.videosLimit,
      audioLimit: user.audioLimit,
      threeDLimit: user.threeDLimit,
      promptsUsed: usage[0] || 0,
      imagesUsed: usage[1] || 0,
      videosUsed: usage[2] || 0,
      audioUsed: usage[3] || 0,
      planType: plan.toLowerCase(),
      subscriptionStartDate: user.subscriptionStartDate,
      subscriptionEndDate: user.subscriptionEndDate,
    };
  }

  async decrementCredits(
    userId: number,
    generationType: AiGenerationType,
  ): Promise<any> {
    const user = await this.aiUserRepo.findOneBy({ id: userId });
    if (!user) throw new BadRequestException('Utilisateur non trouvé');

    if (user.subscriptionEndDate && new Date() > user.subscriptionEndDate) {
      throw new BadRequestException(
        user.planType === PlanType.CURIEUX
          ? "Votre période d'essai de 7 jours est terminée. Veuillez souscrire à un pack pour continuer."
          : 'Votre abonnement a expiré. Veuillez le renouveler pour continuer à utiliser ces fonctionnalités.',
      );
    }

    let limit = 0;
    switch (generationType) {
      case AiGenerationType.TEXT:
        limit = user.promptsLimit;
        break;
      case AiGenerationType.IMAGE:
        limit = user.imagesLimit;
        break;
      case AiGenerationType.VIDEO:
        limit = user.videosLimit;
        break;
      case AiGenerationType.AUDIO:
        limit = user.audioLimit;
        break;
    }

    if (limit === 0) {
      throw new BadRequestException(
        `Le plan actuel n'autorise pas la génération de ${this.getTypeLabel(generationType)}.`,
      );
    }

    let sinceDate: Date;
    if (user.planType === PlanType.CURIEUX) {
      sinceDate = new Date();
      sinceDate.setHours(0, 0, 0, 0);
    } else {
      sinceDate = user.subscriptionStartDate || new Date(0);
    }

    const currentUsage = await this.aiGenRepo.count({
      where: {
        user: { id: userId },
        type: generationType,
        createdAt: MoreThan(sinceDate) as any,
      },
    });

    if (currentUsage >= limit) {
      throw new BadRequestException(
        `Limite atteinte pour les ${this.getTypeLabel(generationType)}. Vous avez utilisé ${limit}/${limit}.`,
      );
    }

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
