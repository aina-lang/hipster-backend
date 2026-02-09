import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { InjectRepository } from '@nestjs/typeorm';
import { AiUser } from '../ai/entities/ai-user.entity';
import { Repository } from 'typeorm';
import { AiSubscription } from './entities/ai-subscription.entity';
import { AiSubscriptionProfile, SubscriptionStatus, PlanType } from '../profiles/entities/ai-subscription-profile.entity';
import { AiCredit } from '../profiles/entities/ai-credit.entity';
import { AiPaymentService } from '../ai-payment/ai-payment.service';

@Injectable()
export class SubscriptionsService {
  private stripe: Stripe;

  constructor(
    private readonly configService: ConfigService,
    private readonly aiPaymentService: AiPaymentService,
    @InjectRepository(AiUser)
    private readonly aiUserRepo: Repository<AiUser>,
    @InjectRepository(AiSubscriptionProfile)
    private readonly subRepo: Repository<AiSubscriptionProfile>,
    @InjectRepository(AiSubscription)
    private readonly aiSubscriptionRepo: Repository<AiSubscription>,
    @InjectRepository(AiCredit)
    private readonly aiCreditRepo: Repository<AiCredit>,
  ) {
    const apiKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (apiKey) {
      this.stripe = new Stripe(apiKey, { apiVersion: '2025-11-17.clover' });
    }
  }

  async getPlansForUser(userId: number) {
    const plans = await this.getPlans();

    // Load profile and subscriptions
    const profile = await this.subRepo.findOne({
      where: { aiUser: { id: userId } },
      relations: ['subscriptions'],
    });

    // If no profile, user is new -> return full plans
    if (!profile) return plans;

    // Auto-cancel expired curieux trial (remove it permanently)
    if (
      profile.planType === PlanType.CURIEUX &&
      profile.subscriptionStatus === SubscriptionStatus.ACTIVE &&
      profile.subscriptionEndDate &&
      new Date() >= new Date(profile.subscriptionEndDate)
    ) {
      profile.subscriptionStatus = SubscriptionStatus.CANCELED;
      await this.subRepo.save(profile);
    }

    const subscriptions = await this.aiSubscriptionRepo.find({
      where: { aiProfile: { id: profile.id } },
    });

    const curieuxUsed = subscriptions.some(
      (s) => s.planName && s.planName.toLowerCase() === 'curieux',
    );

    // If user currently has an active paid plan (not curieux), hide curieux
    const hasActivePaid = profile.planType !== PlanType.CURIEUX && profile.subscriptionStatus === SubscriptionStatus.ACTIVE;

    // If user has an active curieux trial that hasn't expired, hide curieux
    const hasActiveCurieux = profile.planType === PlanType.CURIEUX && profile.subscriptionStatus === SubscriptionStatus.ACTIVE && profile.subscriptionEndDate && new Date() < new Date(profile.subscriptionEndDate);

    // Check paid subscriptions that lasted >= 30 days and are finished
    const paidLongEnoughExpired = subscriptions.some((s) => {
      if (!s.startDate || !s.endDate) return false;
      const name = (s.planName || '').toLowerCase();
      if (name === 'curieux') return false;
      const durationDays =
        (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) /
        (1000 * 60 * 60 * 24);
      return durationDays >= 30 && s.status !== 'active';
    });

    // If the user's profile is canceled, hide their current plan permanently
    const profileCanceled = profile.subscriptionStatus === SubscriptionStatus.CANCELED;

    // Apply rules
    const filtered = plans.filter((p) => {
      // Hide the user's own plan when their profile is canceled
      if (profileCanceled && p.id === profile.planType) return false;

      if (p.id === 'curieux') {
        if (curieuxUsed) return false;
        if (hasActivePaid) return false;
        if (hasActiveCurieux) return false; // Hide if currently using curieux
        // If paidLongEnoughExpired and user never used curieux -> allow
        return true;
      }
      return true;
    });

    return filtered;
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
        // default to Curieux
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
    return this.aiPaymentService.getPlans();
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

      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);

      profile.planType = PlanType.CURIEUX;
      profile.subscriptionStatus = SubscriptionStatus.ACTIVE; // Trial
      profile.subscriptionStartDate = startDate;
      profile.subscriptionEndDate = endDate;

      const savedProfile = await this.subRepo.save(profile);

      // Persist a subscription history entry for audit (free trial)
      try {
        const sub = this.aiSubscriptionRepo.create({
          planName: 'curieux',
          startDate,
          endDate,
          amount: 0,
          status: 'active',
          aiProfile: savedProfile,
        });
        await this.aiSubscriptionRepo.save(sub);
      } catch (err) {
        // Non-blocking: subscription history is best-effort, but log if needed
      }

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
