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
    this.logger.log('Stripe API Key loaded: ' + apiKey);

    if (apiKey) {
      this.stripe = new Stripe(apiKey, { apiVersion: '2024-06-20' as any });
    }
  }

  public async getPlans(isAmbassador = false, discountMonthsCount = 0, isReferred = false) {
    // Count active subscribers (excluding Curieux)
    const activeSubscribersCount = await this.aiUserRepo.count({
      where: {
        planType: Raw((alias) => `${alias} != 'curieux'`),
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      },
    });

    const isEarlyBird = activeSubscribersCount < 30;
    
    // Pricing logic
    const isFilleul = isReferred && discountMonthsCount < 3;
    const hasAmbassadorDiscount = isAmbassador;
    const hasFilleulDiscount = isFilleul;

    // DEBUG LOG
    this.logger.log(`[getPlans] Params: isAmbassador=${isAmbassador}, discountMonthsCount=${discountMonthsCount}, isReferred=${isReferred}`);
    this.logger.log(`[getPlans] Conditions: isEarlyBird=${isEarlyBird}, isFilleul=${isFilleul}, hasAmbassadorDiscount=${hasAmbassadorDiscount}`);
    
    // ATELIER: TOUJOURS 17,90€ (aucune promo)
    const atelierPrice = 17.9;
    const atelierPriceId = 'price_1TCAALK5fB5lGbp8rB3IEJnb';

    // STUDIO: Réductions Ambassadeur/Filleul + Early Bird
    const studioPrice = hasAmbassadorDiscount ? 21 : (hasFilleulDiscount ? 22 : (isEarlyBird ? 21 : 29.9));
    this.logger.log(`[getPlans] Studio Price Selected: ${studioPrice}€`);
    
    const studioPriceId = hasAmbassadorDiscount
      ? 'price_1TCA8fK5fB5lGbp8Llm0S0MI' // 21€ (Ambassadeur)
      : (hasFilleulDiscount
        ? 'price_1TCA97K5fB5lGbp8JE1J8LIM' // 22€ (Filleul 3 mois)
        : (isEarlyBird 
          ? 'price_1TCA8yK5fB5lGbp8rYL1wQ1x' // 21€ (Early Bird)
          : 'price_1TCA9KK5fB5lGbp82YZRJVQ7')); // 29,90€ (Standard)

    return [
      {
        id: 'curieux',
        name: 'Curieux',
        price: 'Gratuit',
        stripePriceId: null,
        promptsLimit: 2,
        imagesLimit: 1,
        videosLimit: 0,
        audioLimit: 0,
        threeDLimit: 0,
        description: '7 jours gratuits',
        features: ['2 textes / jour', '1 image / jour', 'Pas d’export'],
      },
      {
        id: 'atelier',
        name: 'Atelier',
        price: atelierPrice,
        stripePriceId: atelierPriceId,
        promptsLimit: 999999,
        imagesLimit: 50,
        videosLimit: 0,
        audioLimit: 0,
        threeDLimit: 0,
        description: 'L\'essentiel pour créer',
        features: [
          'Génération de texte',
          "Génération d'image",
          "Accompagnement de l'agence",
        ],
      },
      {
        id: 'studio',
        name: 'Studio',
        price: studioPrice,
        stripePriceId: studioPriceId,
        promptsLimit: 999999,
        imagesLimit: 100,
        videosLimit: 0,
        audioLimit: 0,
        threeDLimit: 0,
        description: hasAmbassadorDiscount ? 'Tarif Ambassadeur' : (hasFilleulDiscount ? 'Tarif parrainage (3 mois)' : (isEarlyBird ? '21€ 30 premiers - ensuite 29,90€ / mois' : 'Orienté photo')),
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
        stripePriceId: 'price_1TCA6HK5fB5lGbp8z5RzwxiO',
        promptsLimit: 999999,
        imagesLimit: 100,
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
          'Génération 3D/Sketch',
          "Accompagnement de l'agence",
        ],
      },
    ];
  }

  async getPlansForUser(userId: number) {
    const user = await this.aiUserRepo.findOneBy({ id: userId });
    const plans = await this.getPlans(
      user?.isAmbassador || false, 
      user?.discountMonthsCount || 0,
      !!user?.referredBy
    );

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
    try {
      this.logger.log(
        `Creating payment sheet for user ${userId}, price ${priceId}, plan ${planId}`,
      );
      
      const user = await this.aiUserRepo.findOneBy({ id: userId });
      if (!user) throw new BadRequestException('AiUser not found');
      
      // DEBUG LOG
      this.logger.log(`[DEBUG] User data: isAmbassador=${user.isAmbassador}, discountMonthsCount=${user.discountMonthsCount}, referredBy=${user.referredBy}`);
      
      const plans = await this.getPlans(
        user?.isAmbassador || false,
        user?.discountMonthsCount || 0,
        !!user?.referredBy
      );
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

      // Prepare variables for retry logic
      let ephemeralKey;
      let subscription;

      try {
        ephemeralKey = await this.stripe.ephemeralKeys.create(
          { customer: customerId },
          { apiVersion: '2024-06-20' as any },
        );
      } catch (error: any) {
        // Auto-healing: If customer doesn't exist in Stripe (e.g. env changed), create a new one
        if (error.code === 'resource_missing' && error.param === 'customer') {
          this.logger.warn(
            `Customer ${customerId} not found in Stripe. Creating new customer for user ${userId}.`,
          );

          const newCustomer = await this.stripe.customers.create({
            email: user.email,
            metadata: { userId: user.id.toString() },
          });

          customerId = newCustomer.id;
          user.stripeCustomerId = customerId;
          await this.aiUserRepo.save(user);

          // Retry with new customer ID
          ephemeralKey = await this.stripe.ephemeralKeys.create(
            { customer: customerId },
            { apiVersion: '2024-06-20' as any },
          );
        } else {
          this.logger.error(
            `[Stripe EphemeralKey Error] ${error.message}`,
            error.stack,
          );
          throw error;
        }
      }

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
          'price_1SzcrqFhrfQ5vRxFsG1jQfGE';

        subscription = await this.stripe.subscriptions.create({
          customer: customerId,
          items: [{ price: atelierPriceId }],
          trial_period_days: 7,
          payment_behavior: 'default_incomplete',
          payment_settings: { save_default_payment_method: 'on_subscription' },
          expand: ['pending_setup_intent'],
          metadata: { userId: userId.toString(), planId: 'curieux' },
        });

        const result = {
          setupIntentClientSecret: (
            subscription.pending_setup_intent as Stripe.SetupIntent
          )?.client_secret,
          subscriptionId: subscription.id,
          ephemeralKey: ephemeralKey.secret,
          customerId: customerId,
        };
        this.logger.log(
          `[Curieux Trial] Payment sheet created successfully: ${subscription.id}`,
        );
        return result;
      }

      // For paid plans (Atelier, Studio, Agence)
      // Check if user already has an active subscription to update instead of creating a new one
      if (user.stripeSubscriptionId && user.planType !== PlanType.CURIEUX) {
        this.logger.log(
          `[createPaymentSheet] Updating existing subscription ${user.stripeSubscriptionId} for refill/change`,
        );

        const existingSub = await this.stripe.subscriptions.retrieve(
          user.stripeSubscriptionId,
        );

        const updateParams: any = {
          items: [
            {
              id: (existingSub as any).items.data[0].id,
              price: selectedPlan.stripePriceId,
            },
          ],
          payment_behavior: 'default_incomplete',
          billing_cycle_anchor: 'now', // Force immediate charge for refill/reset
          proration_behavior: 'none', // Don't carry over unused time for refill
          expand: ['latest_invoice.payment_intent'],
        };

        // End trial if one is active
        if (
          (existingSub as any).trial_end &&
          (existingSub as any).trial_end * 1000 > Date.now()
        ) {
          updateParams.trial_end = 'now';
        }

        subscription = await this.stripe.subscriptions.update(
          user.stripeSubscriptionId,
          updateParams,
        );
      } else {
        const subParams: Stripe.SubscriptionCreateParams = {
          customer: customerId,
          items: [{ price: selectedPlan.stripePriceId }],
          payment_behavior: 'default_incomplete',
          payment_settings: { save_default_payment_method: 'on_subscription' },
          expand: ['latest_invoice.payment_intent'],
          metadata: { userId: userId.toString(), planId: selectedPlan.id },
        };

        // Apply referral discount if it's the first paid subscription
        if (user.referredBy && !user.hasUsedTrial && user.planType === PlanType.CURIEUX) {
          this.logger.log(`Applying referral discount for user ${userId}`);
        }

        subscription = await this.stripe.subscriptions.create(subParams);
      }

      const invoice = subscription.latest_invoice as any;
      const paymentIntent = invoice?.payment_intent as Stripe.PaymentIntent;

      // If no payment intent, create one by generating an invoice
      let clientSecret = paymentIntent?.client_secret;
      if (!clientSecret && subscription.id) {
        this.logger.warn(
          `No payment_intent found in latest_invoice for subscription ${subscription.id}. Creating invoice...`
        );
        
        try {
          const newInvoice = await this.stripe.invoices.create({
            customer: customerId,
            subscription: subscription.id,
            auto_advance: false,
          });
          
          const newPaymentIntent = (newInvoice as any)?.payment_intent as Stripe.PaymentIntent;
          clientSecret = newPaymentIntent?.client_secret;
          this.logger.log(`Created invoice ${newInvoice.id} with payment intent secret`);
        } catch (invoiceError) {
          this.logger.error(`Failed to create invoice: ${invoiceError.message}`);
        }
      }

      const result = {
        paymentIntentClientSecret: clientSecret,
        subscriptionId: subscription.id,
        ephemeralKey: ephemeralKey.secret,
        customerId: customerId,
      };
      this.logger.log(
        `[${selectedPlan.id}] Payment sheet created successfully: ${subscription.id}, hasSecret=${!!result.paymentIntentClientSecret}`,
      );
      return result;
    } catch (error: any) {
      this.logger.error(
        `[createPaymentSheet Error] userId=${userId}, priceId=${priceId}, planId=${planId}, message=${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async confirmPlan(userId: number, planId: string, subscriptionId?: string) {
    const user = await this.aiUserRepo.findOneBy({ id: userId });
    if (!user) throw new BadRequestException('Utilisateur non trouvé');

    const plans = await this.getPlans(
      user?.isAmbassador || false,
      user?.discountMonthsCount || 0,
      !!user?.referredBy
    );
    const selectedPlan = plans.find((p) => p.id === planId);
    if (!selectedPlan) throw new BadRequestException('Plan invalide');

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
      subscriptionStatus: user.subscriptionStatus,
      stripeCustomerId: user.stripeCustomerId,
      stripeSubscriptionId: user.stripeSubscriptionId,
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

    const plans = await this.getPlans(
      user?.isAmbassador || false,
      user?.discountMonthsCount || 0,
      !!user?.referredBy
    );
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

    // Déterminer si c'est un upgrade, downgrade ou un refill (même plan)
    const currentPrice =
      typeof currentPlan?.price === 'number' ? currentPlan.price : 0;
    const newPrice = typeof newPlan.price === 'number' ? newPlan.price : 0;

    const isSamePlan = newPlanId === user.planType?.toLowerCase();
    const isUpgrade = newPrice > currentPrice || isSamePlan;

    // Récupérer la subscription Stripe
    const stripeSubscription = (await this.stripe.subscriptions.retrieve(
      user.stripeSubscriptionId,
    )) as any;

    // Mettre à jour la subscription Stripe
    const updateParams: any = {
      items: [
        {
          id: stripeSubscription.items.data[0].id,
          price: newPlan.stripePriceId,
        },
      ],
      proration_behavior: isUpgrade ? 'create_prorations' : 'none',
      billing_cycle_anchor: isUpgrade ? 'now' : 'unchanged',
    };

    // Si on demande un reset immédiat (upgrade/refill) et qu'il y a un essai en cours,
    // on doit terminer l'essai immédiatement car billing_cycle_anchor ne peut pas être avant trial_end
    if (
      isUpgrade &&
      stripeSubscription.trial_end &&
      stripeSubscription.trial_end * 1000 > Date.now()
    ) {
      updateParams.trial_end = 'now';
    }

    const updatedSubscription = (await this.stripe.subscriptions.update(
      user.stripeSubscriptionId,
      updateParams,
    )) as any;

    this.logger.log(
      `[switchPlan] Subscription updated. isSamePlan=${isSamePlan}`,
    );

    // Si upgrade ou même plan (refill), mettre à jour immédiatement
    if (isUpgrade) {
      user.planType =
        PlanType[newPlanId.toUpperCase() as keyof typeof PlanType];
      await this.aiUserRepo.save(user);

      // Appliquer les nouvelles limites (force le reset car billing_cycle_anchor est 'now')
      await this.confirmPlan(userId, newPlanId, user.stripeSubscriptionId);

      this.logger.log(
        `User ${userId} ${isSamePlan ? 'refilled' : 'upgraded to'} ${newPlanId}`,
      );
    } else {
      this.logger.log(
        `User ${userId} scheduled downgrade to ${newPlanId} at end of period`,
      );
    }

    return {
      message: isSamePlan
        ? 'Votre forfait a été renouvelé avec succès ! Vos limites ont été réinitialisées.'
        : isUpgrade
          ? 'Upgrade effectué avec succès !'
          : 'Downgrade planifié pour la fin de votre cycle actuel.',
      effectiveDate: isUpgrade
        ? new Date()
        : new Date(updatedSubscription.current_period_end * 1000),
      newPlan: newPlan.name,
      isUpgrade: isUpgrade || isSamePlan,
      isRefill: isSamePlan,
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
        userName: user.name || user.email,
        attemptNumber,
        maxAttempts,
        nextAttemptDate: nextAttemptDate?.toLocaleDateString('fr-FR'),
        invoiceAmount: (invoice.amount_due / 100).toFixed(2),
        updatePaymentUrl: `${process.env.FRONTEND_URL || 'https://app.hipster.fr'}/profile`,
      },
    });

    this.logger.log(`Payment failed email sent to ${user.email}`);
  }

  async sendSubscriptionCancelledEmail(user: AiUser): Promise<void> {
    await this.mailService.sendEmail({
      to: user.email,
      subject: 'ℹ️ Votre abonnement Hipster IA est terminé',
      template: 'subscription-cancelled',
      context: {
        name: user.name || user.email,
        endDate: new Date().toLocaleDateString('fr-FR'),
      },
    });
    this.logger.log(`Subscription cancelled email sent to ${user.email}`);
  }

  async sendTrialEndedEmail(user: AiUser, planName: string): Promise<void> {
    await this.mailService.sendEmail({
      to: user.email,
      subject: "🚀 Votre période d'essai est terminée - Bienvenue !",
      template: 'trial-ended',
      context: {
        name: user.name || user.email,
        planName,
      },
    });
    this.logger.log(`Trial ended email sent to ${user.email}`);
  }

  async syncWithStripe(userId: number): Promise<AiUser> {
    const user = await this.aiUserRepo.findOneBy({ id: userId });
    if (!user) throw new BadRequestException('Utilisateur non trouvé');
    if (!user.stripeSubscriptionId) return user;

    try {
      const subscription = await this.stripe.subscriptions.retrieve(
        user.stripeSubscriptionId,
      );

      this.logger.log(
        `[syncWithStripe] User ${userId} subscription ${subscription.id} status: ${subscription.status}`,
      );

      const priceId = subscription.items.data[0]?.price.id;
      const plans = await this.getPlans(
        user.isAmbassador,
        user.discountMonthsCount || 0,
        !!user.referredBy,
      );
      const currentPlan = plans.find((p) => p.stripePriceId === priceId);

      // Status mapping
      if (subscription.status === 'active') {
        // Upgrade/Sync plan if needed
        if (currentPlan && user.planType?.toLowerCase() !== currentPlan.id) {
          this.logger.log(
            `[syncWithStripe] Syncing user ${userId} plan from ${user.planType} to ${currentPlan.id}.`,
          );
          user.planType =
            PlanType[currentPlan.id.toUpperCase() as keyof typeof PlanType];
          
          user.promptsLimit = currentPlan.promptsLimit;
          user.imagesLimit = currentPlan.imagesLimit;
          user.videosLimit = currentPlan.videosLimit;
          user.audioLimit = currentPlan.audioLimit;
          user.threeDLimit = currentPlan.threeDLimit || 0;

          // Send Trial Ended Email if they were on Curieux
          try {
            await this.sendTrialEndedEmail(user, currentPlan.name);
          } catch (e) {
            this.logger.error(
              `Failed to send trial ended email to ${user.email} during sync`,
              e.message,
            );
          }
        }
        user.subscriptionStatus = SubscriptionStatus.ACTIVE;
      } else if (subscription.status === 'trialing') {
        user.subscriptionStatus = SubscriptionStatus.TRIAL;
      } else if (['canceled', 'unpaid', 'incomplete_expired'].includes(subscription.status)) {
        user.subscriptionStatus = SubscriptionStatus.CANCELED;
      } else if (subscription.status === 'past_due') {
        user.subscriptionStatus = SubscriptionStatus.PAST_DUE;
      }

      // Update dates
      user.subscriptionStartDate = new Date(subscription.current_period_start * 1000);
      user.subscriptionEndDate = new Date(subscription.current_period_end * 1000);

      return await this.aiUserRepo.save(user);
    } catch (error) {
      this.logger.error(`[syncWithStripe Error] User ${userId}: ${error.message}`);
      return user;
    }
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
