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
      },
      {
        id: 'atelier',
        name: 'Atelier',
        price: 9.9,
        stripePriceId: 'price_Atelier1790',
      },
      {
        id: 'studio',
        name: 'Studio',
        price: 29.9,
        stripePriceId: 'price_Studio2990',
      },
      {
        id: 'agence',
        name: 'Agence',
        price: 69.99,
        stripePriceId: 'price_Agence6990',
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
          credits: 10,
        });
        await this.aiProfileRepo.save(newProfile);
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
}
