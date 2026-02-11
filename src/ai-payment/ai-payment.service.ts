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
import { MailService } from '../mail/mail.service';

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
    private readonly mailService: MailService,
  ) {
    const apiKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (apiKey) {
      this.stripe = new Stripe(apiKey, { apiVersion: '2024-06-20' as any });
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
      ? 'price_1SzaLpFhrfQ5vRxFTBahnIYT'
      : 'price_1SzaNwFhrfQ5vRxFYb8l3e8A';

    return [
      {
        id: 'curieux',
        name: 'Curieux',
        price: 'Gratuit',
        stripePriceId: null,
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
        stripePriceId: 'price_1SzaPAFhrfQ5vRxF8FXY9YdE',
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
        stripePriceId: 'price_1SzaPnFhrfQ5vRxFTjyNkBsk',
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
    this.logger.log(
      `Creating payment sheet for user ${userId}, price ${priceId}, plan ${planId}`,
    );
    const plans = await this.getPlans();
    let selectedPlan;

    if (planId === 'curieux') {
      selectedPlan = plans.find((p) => p.id === 'curieux');
    } else {
      selectedPlan = planId
        ? plans.find((p) => p.id === planId)
        : plans.find((p) => p.stripePriceId === priceId);
    }

    if (!selectedPlan) {
      this.logger.warn(
        `Invalid price or plan: priceId=${priceId}, planId=${planId}`,
      );
      throw new BadRequestException('Prix invalide');
    }

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
      { apiVersion: '2024-06-20' as any },
    );

    let subscription: Stripe.Subscription;

    if (selectedPlan.id === 'curieux') {
      if (user.hasUsedTrial && user.planType !== PlanType.CURIEUX) {
        this.logger.warn(
          `User ${userId} already used trial and is not on curieux plan`,
        );
        throw new BadRequestException('Essai gratuit déjà utilisé');
      }

      // Transitions to ATELIER after trial
      const atelierPriceId =
        plans.find((p) => p.id === 'atelier')?.stripePriceId ||
        'price_1SzaLpFhrfQ5vRxFTBahnIYT';

      subscription = await this.stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: atelierPriceId }],
        trial_period_days: 7,
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['pending_setup_intent'],
        metadata: { userId: userId.toString(), planId: 'curieux' },
      });

      return {
        setupIntentClientSecret: (
          subscription.pending_setup_intent as Stripe.SetupIntent
        )?.client_secret,
        subscriptionId: subscription.id,
        ephemeralKey: ephemeralKey.secret,
        customerId: customerId,
      };
    }

    // For paid plans (Atelier, Studio, Agence)
    subscription = await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: selectedPlan.stripePriceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: { userId: userId.toString(), planId: selectedPlan.id },
    });

    const invoice = subscription.latest_invoice as any;
    const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;

    return {
      paymentIntentClientSecret: paymentIntent.client_secret,
      subscriptionId: subscription.id,
      ephemeralKey: ephemeralKey.secret,
      customerId: customerId,
    };
  }

  async confirmPlan(userId: number, planId: string, subscriptionId?: string) {
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

    if (subscriptionId) {
      user.stripeSubscriptionId = subscriptionId;
    }

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

  async cancelSubscription(userId: number): Promise<any> {
    const user = await this.aiUserRepo.findOneBy({ id: userId });
    if (!user || !user.stripeSubscriptionId) {
      throw new BadRequestException('Aucun abonnement actif trouvé');
    }

    const subscription = (await this.stripe.subscriptions.update(
      user.stripeSubscriptionId,
      {
        cancel_at_period_end: true,
      },
    )) as any;

    this.logger.log(
      `Subscription ${subscription.id} set to cancel at period end for user ${userId}`,
    );

    return {
      message: 'Votre abonnement sera annulé à la fin de la période en cours.',
      cancelAt: new Date(subscription.current_period_end * 1000),
    };
  }

  async switchPlan(userId: number, newPlanId: string): Promise<any> {
    const user = await this.aiUserRepo.findOneBy({ id: userId });
    if (!user || !user.stripeSubscriptionId) {
      throw new BadRequestException('Aucun abonnement actif trouvé');
    }

    const plans = await this.getPlans();
    const currentPlan = plans.find(
      (p) => p.id === user.planType?.toLowerCase(),
    );
    const newPlan = plans.find((p) => p.id === newPlanId);

    if (!newPlan || !newPlan.stripePriceId) {
      throw new BadRequestException('Plan invalide');
    }

    if (newPlanId === 'curieux') {
      throw new BadRequestException('Impossible de revenir au plan Curieux');
    }

    // Déterminer si c'est un upgrade ou downgrade
    const currentPrice =
      typeof currentPlan?.price === 'number' ? currentPlan.price : 0;
    const newPrice = typeof newPlan.price === 'number' ? newPlan.price : 0;
    const isUpgrade = newPrice > currentPrice;

    // Récupérer la subscription Stripe
    const stripeSubscription = (await this.stripe.subscriptions.retrieve(
      user.stripeSubscriptionId,
    )) as any;

    // Mettre à jour la subscription Stripe
    const updatedSubscription = (await this.stripe.subscriptions.update(
      user.stripeSubscriptionId,
      {
        items: [
          {
            id: stripeSubscription.items.data[0].id,
            price: newPlan.stripePriceId,
          },
        ],
        proration_behavior: isUpgrade ? 'create_prorations' : 'none',
        billing_cycle_anchor: isUpgrade ? 'now' : 'unchanged',
      },
    )) as any;

    // Si upgrade, mettre à jour immédiatement
    if (isUpgrade) {
      user.planType =
        PlanType[newPlanId.toUpperCase() as keyof typeof PlanType];
      await this.aiUserRepo.save(user);

      // Appliquer les nouvelles limites
      await this.confirmPlan(userId, newPlanId, user.stripeSubscriptionId);

      this.logger.log(`User ${userId} upgraded to ${newPlanId}`);
    } else {
      this.logger.log(
        `User ${userId} scheduled downgrade to ${newPlanId} at end of period`,
      );
    }

    return {
      message: isUpgrade
        ? 'Upgrade effectué avec succès !'
        : 'Downgrade planifié pour la fin de votre cycle actuel.',
      effectiveDate: isUpgrade
        ? new Date()
        : new Date(updatedSubscription.current_period_end * 1000),
      newPlan: newPlan.name,
      isUpgrade,
    };
  }

  async sendPaymentFailedEmail(user: AiUser, invoice: any): Promise<void> {
    const attemptNumber = invoice.attempt_count || 1;
    const maxAttempts = 4; // Stripe default
    const nextAttemptDate = invoice.next_payment_attempt
      ? new Date(invoice.next_payment_attempt * 1000)
      : null;

    await this.mailService.sendEmail({
      to: user.email,
      subject: '⚠️ Échec de paiement - Action requise',
      template: 'payment-failed',
      context: {
        userName: user.name,
        attemptNumber,
        maxAttempts,
        nextAttemptDate: nextAttemptDate?.toLocaleDateString('fr-FR'),
        invoiceAmount: (invoice.amount_due / 100).toFixed(2),
        updatePaymentUrl: `${process.env.FRONTEND_URL || 'https://app.hipster.fr'}/profile`,
      },
    });

    this.logger.log(`Payment failed email sent to ${user.email}`);
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
