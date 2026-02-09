import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Subscriptions')
@Controller('ai/subscriptions')
@UseGuards(AuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @ApiOperation({ summary: "Récupérer mon profil d'abonnement" })
  @Get('me')
  async getMySubscription(@Req() req) {
    return this.subscriptionsService.getSubscriptionProfile(req.user.sub);
  }

  @Public()
  @ApiOperation({ summary: "Lister les plans d'abonnement" })
  @Get('plans')
  async getPlans() {
    return this.subscriptionsService.getPlans();
  }

  @ApiOperation({ summary: "Lister les plans d'abonnement (utilisateur connecté)" })
  @Get('plans/me')
  async getPlansForUser(@Req() req) {
    const userId = req.user.sub;
    return this.subscriptionsService.getPlansForUser(userId);
  }

  @ApiOperation({ summary: 'Souscrire à un abonnement' })
  @ResponseMessage('Souscription effectuée avec succès')
  @Post('subscribe')
  async createSubscription(@Req() req, @Body() body: { planId: string }) {
    return this.subscriptionsService.createSubscription(
      req.user.sub,
      body.planId,
    );
  }

  @ApiOperation({ summary: 'Créer une feuille de paiement Stripe' })
  @Post('create-payment-sheet')
  async createPaymentSheet(
    @Req() req,
    @Body() body: { priceId: string; userId?: number },
  ) {
    const userId = body.userId || req.user.sub;
    return this.subscriptionsService.createPaymentSheet(userId, body.priceId);
  }
}
