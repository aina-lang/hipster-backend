import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, Raw } from 'typeorm';
import { AiUser } from '../ai/entities/ai-user.entity';
import {
  AiSubscriptionProfile,
  PlanType,
  SubscriptionStatus,
} from '../profiles/entities/ai-subscription-profile.entity';
import { AiCredit } from '../profiles/entities/ai-credit.entity';
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

  public async getPlans() {
    // Count active subscribers (excluding Curieux)
    const activeSubscribersCount = await this.aiProfileRepo.count({
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
        stripePriceId: 'price_Studio2990', // Uses Studio price for the trial
        promptsLimit: 2,
        imagesLimit: 2,
        videosLimit: 0,
        audioLimit: 0,
        threeDLimit: 0,
        description: '7 jours gratuits, puis Pack Studio (29.90€/mois)',
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

  private getPriceInCents(price: number | string): number {
    const priceNum = typeof price === 'string' ? parseFloat(price) : price;
    return Math.round(priceNum * 100);
  }

  async createPaymentSheet(userId: number, priceId?: string, planId?: string) {
    const plans = await this.getPlans();

    // DEBUG: List all prices
    try {
      const prices = await this.stripe.prices.list({ limit: 20 });
      this.logger.warn('DEBUG: AVAILABLE STRIPE PRICES:');
      prices.data.forEach((p) => {
        this.logger.warn(
          `- ID: ${p.id} | Amount: ${p.unit_amount} | Currency: ${p.currency} | Product: ${p.product}`,
        );
      });
    } catch (e) {
      this.logger.error('Failed to list prices', e);
    }

    // Prefer planId if available, otherwise find by priceId
    let selectedPlan;
    if (planId) {
      selectedPlan = plans.find((p) => p.id === planId);
    } else {
      selectedPlan = plans.find((p) => p.stripePriceId === priceId);
    }

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
        const plans = await this.getPlans();
        const curieuxPlan = plans.find((p) => p.id === 'curieux');
        const credit = this.aiCreditRepo.create({
          promptsLimit: curieuxPlan?.promptsLimit ?? 3,
          imagesLimit: curieuxPlan?.imagesLimit ?? 2,
          videosLimit: curieuxPlan?.videosLimit ?? 0,
          audioLimit: curieuxPlan?.audioLimit ?? 0,
          aiProfile: saved,
        });
        await this.aiCreditRepo.save(credit);
      }
    }

    // Create ephemeral key for client
    const ephemeralKey = await this.stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2025-11-17.clover' }, // Kept original version
    );

    // LOGIC for Curieux (Subscription with Trial)
    if (selectedPlan.id === 'curieux') {
      // Create Subscription with 7-day trial
      const subscription = await this.stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: selectedPlan.stripePriceId }],
        trial_period_days: 7,
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['pending_setup_intent', 'latest_invoice.payment_intent'],
        metadata: {
          userId: userId.toString(),
          planId: 'curieux',
        },
      });

      // For a trial with no immediate payment, we usually get a pending_setup_intent
      let clientSecret = '';
      let isSetupIntent = false;

      if (subscription.pending_setup_intent) {
        const setupIntent =
          subscription.pending_setup_intent as Stripe.SetupIntent;
        clientSecret = setupIntent.client_secret;
        isSetupIntent = true;
      } else if (
        subscription.latest_invoice &&
        typeof subscription.latest_invoice !== 'string'
      ) {
        const invoice = subscription.latest_invoice as any;
        if (
          invoice.payment_intent &&
          typeof invoice.payment_intent !== 'string'
        ) {
          clientSecret = (invoice.payment_intent as Stripe.PaymentIntent)
            .client_secret;
        }
      }

      return {
        setupIntentClientSecret: isSetupIntent ? clientSecret : undefined,
        paymentIntentClientSecret: !isSetupIntent ? clientSecret : undefined,
        ephemeralKey: ephemeralKey.secret,
        customerId: customerId,
        subscriptionId: subscription.id,
      };
    }

    // DEFAULT LOGIC (One-off PaymentIntent for others - preserving existing behavior for now)
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
    const plans = await this.getPlans();
    const selectedPlan = plans.find((p) => p.id === planId);

    if (!selectedPlan) {
      throw new BadRequestException('Plan invalide');
    }

    // Get user and profile
    let user = await this.aiUserRepo.findOne({
      where: { id: userId },
      relations: ['aiProfile', 'aiProfile.aiCredit'],
    });

    if (!user) {
      throw new BadRequestException('Utilisateur non trouvé');
    }

    // Create AI Profile if it doesn't exist
    if (!user.aiProfile) {
      const profile = this.aiProfileRepo.create({
        aiUser: user,
        planType:
          PlanType[selectedPlan.id.toUpperCase() as keyof typeof PlanType] ||
          PlanType.CURIEUX,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      });
      user.aiProfile = await this.aiProfileRepo.save(profile);
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
    user.aiProfile.planType =
      PlanType[selectedPlan.id.toUpperCase() as keyof typeof PlanType] ||
      PlanType.CURIEUX;
    user.aiProfile.subscriptionStatus = SubscriptionStatus.ACTIVE;

    // Set subscription dates
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);

    user.aiProfile.subscriptionStartDate = startDate;
    user.aiProfile.subscriptionEndDate = endDate;
    user.aiProfile.lastRenewalDate = startDate;
    user.aiProfile.nextRenewalDate = endDate;

    await this.aiProfileRepo.save(user.aiProfile);

    this.logger.log(
      `Plan confirmed for user ${userId}: ${planId} with limits ${JSON.stringify(selectedPlan)}`,
    );

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

    const plan = user.aiProfile.planType || PlanType.CURIEUX;
    const planConfig =
      (await this.getPlans()).find((p) => p.id === plan.toLowerCase()) ||
      (await this.getPlans())[0];

    // Determine the date range for counting usage
    let sinceDate: Date;
    if (plan === PlanType.CURIEUX) {
      // Daily count for Curieux
      sinceDate = new Date();
      sinceDate.setHours(0, 0, 0, 0);
    } else {
      // Use stored subscription start date for paid plans, fallback to start of month if missing
      sinceDate =
        user.aiProfile.subscriptionStartDate ||
        new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    }

    const promptsUsed = await this.aiGenRepo
      .count({
        where: {
          user: { id: userId },
          type: AiGenerationType.TEXT,
          createdAt: MoreThan(sinceDate) as any,
        },
      })
      .catch(() => 0);

    const imagesUsed = await this.aiGenRepo
      .count({
        where: {
          user: { id: userId },
          type: AiGenerationType.IMAGE,
          createdAt: MoreThan(sinceDate) as any,
        },
      })
      .catch(() => 0);

    const videosUsed = await this.aiGenRepo
      .count({
        where: {
          user: { id: userId },
          type: AiGenerationType.VIDEO,
          createdAt: MoreThan(sinceDate) as any,
        },
      })
      .catch(() => 0);

    const audioUsed = await this.aiGenRepo
      .count({
        where: {
          user: { id: userId },
          type: AiGenerationType.AUDIO,
          createdAt: MoreThan(sinceDate) as any,
        },
      })
      .catch(() => 0);

    // Always return limits from current plan config, not from stored credit
    return {
      promptsLimit: planConfig.promptsLimit,
      imagesLimit: planConfig.imagesLimit,
      videosLimit: planConfig.videosLimit,
      audioLimit: planConfig.audioLimit,
      promptsUsed,
      imagesUsed,
      videosUsed,
      audioUsed,
      planType: plan.toLowerCase(),
      createdAt: user.aiProfile.aiCredit.createdAt,
      updatedAt: user.aiProfile.aiCredit.updatedAt,
      subscriptionStartDate: user.aiProfile.subscriptionStartDate,
      subscriptionEndDate: user.aiProfile.subscriptionEndDate,
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

    // Ensure profile and credit exist. If missing, create defaults for 'curieux'
    const curieuxPlan = (await this.getPlans()).find((p) => p.id === 'curieux');

    if (!user) {
      throw new BadRequestException('Utilisateur introuvable');
    }

    if (!user.aiProfile) {
      const newProfile = this.aiProfileRepo.create({
        aiUser: { id: userId } as AiUser,
        planType: PlanType.CURIEUX,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      });
      user.aiProfile = await this.aiProfileRepo.save(newProfile);
    }

    if (!user.aiProfile.aiCredit) {
      const creditToCreate = this.aiCreditRepo.create({
        promptsLimit: curieuxPlan?.promptsLimit ?? 100,
        imagesLimit: curieuxPlan?.imagesLimit ?? 50,
        videosLimit: curieuxPlan?.videosLimit ?? 10,
        audioLimit: curieuxPlan?.audioLimit ?? 20,
        aiProfile: user.aiProfile,
      });
      user.aiProfile.aiCredit = await this.aiCreditRepo.save(creditToCreate);
    }

    const credit = user.aiProfile.aiCredit;

    // Check for subscription expiration
    if (
      user.aiProfile.subscriptionEndDate &&
      new Date() > user.aiProfile.subscriptionEndDate
    ) {
      throw new BadRequestException(
        user.aiProfile.planType === PlanType.CURIEUX
          ? "Votre période d'essai de 7 jours est terminée. Veuillez souscrire à un pack pour continuer."
          : 'Votre abonnement a expiré. Veuillez le renouveler pour continuer à utiliser ces fonctionnalités.',
      );
    }

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
        throw new BadRequestException(
          `Type de génération non supporté: ${generationType}`,
        );
    }

    // Get current usage
    const sinceDate = credit.createdAt || new Date(0);
    let currentUsage = 0;

    switch (generationType) {
      case AiGenerationType.TEXT:
        currentUsage = await this.aiGenRepo
          .count({
            where: {
              user: { id: userId },
              type: AiGenerationType.TEXT,
              createdAt: MoreThan(sinceDate) as any,
            },
          })
          .catch(() => 0);
        break;
      case AiGenerationType.IMAGE:
        currentUsage = await this.aiGenRepo
          .count({
            where: {
              user: { id: userId },
              type: AiGenerationType.IMAGE,
              createdAt: MoreThan(sinceDate) as any,
            },
          })
          .catch(() => 0);
        break;
      case AiGenerationType.VIDEO:
        currentUsage = await this.aiGenRepo
          .count({
            where: {
              user: { id: userId },
              type: AiGenerationType.VIDEO,
              createdAt: MoreThan(sinceDate) as any,
            },
          })
          .catch(() => 0);
        break;
      case AiGenerationType.AUDIO:
        currentUsage = await this.aiGenRepo
          .count({
            where: {
              user: { id: userId },
              type: AiGenerationType.AUDIO,
              createdAt: MoreThan(sinceDate) as any,
            },
          })
          .catch(() => 0);
        break;
    }

    // Get the limit
    const limit = credit[limitFieldName] as number;

    // If limit is 0, the plan doesn't allow this generation type
    if (typeof limit === 'number' && limit === 0) {
      throw new BadRequestException(
        `Le plan actuel n'autorise pas la génération de ${this.getTypeLabel(generationType)}.`,
      );
    }

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
