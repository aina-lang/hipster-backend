import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { AiPaymentService } from './ai-payment.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AiGenerationType } from '../ai/entities/ai-generation.entity';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('AI-Payment')
@Controller('ai/payment')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class AiPaymentController {
  constructor(private readonly aiPaymentService: AiPaymentService) {}

  @ApiOperation({ summary: "Récupérer mon profil d'abonnement" })
  @Get('me')
  async getMySubscription(@Req() req) {
    return this.aiPaymentService.getSubscriptionProfile(req.user.sub);
  }

  @Public()
  @ApiOperation({ summary: "Lister les plans d'abonnement" })
  @Get('plans')
  async getPlans() {
    return this.aiPaymentService.getPlans();
  }

  @ApiOperation({
    summary: "Lister les plans d'abonnement (utilisateur connecté)",
  })
  @Get('plans/me')
  async getPlansForUser(@Req() req) {
    const userId = req.user.sub;
    return this.aiPaymentService.getPlansForUser(userId);
  }

  @ApiOperation({ summary: 'Souscrire à un abonnement' })
  @Post('subscribe')
  async subscribe(@Req() req, @Body() body: { planId: string }) {
    return this.aiPaymentService.confirmPlan(req.user.sub, body.planId);
  }

  @ApiOperation({ summary: 'Créer une feuille de paiement Stripe pour IA' })
  @Post('create-payment-sheet')
  async createPaymentSheet(
    @Req() req,
    @Body() body: { priceId: string; userId?: number; planId?: string },
  ) {
    const userId = body.userId || req.user.sub;
    return this.aiPaymentService.createPaymentSheet(
      userId,
      body.priceId,
      body.planId,
    );
  }

  @ApiOperation({
    summary: "Confirmer un plan et appliquer les limites d'utilisation",
  })
  @Post('confirm-plan')
  async confirmPlan(@Req() req, @Body() body: { planId: string }) {
    const userId = req.user.sub;
    return this.aiPaymentService.confirmPlan(userId, body.planId);
  }

  @ApiOperation({ summary: "Récupérer les limites d'utilisation actuelles" })
  @Get('credits')
  async getCredits(@Req() req) {
    const userId = req.user.sub;
    return this.aiPaymentService.getCredits(userId);
  }

  @ApiOperation({
    summary:
      "Décrémenter les crédits d'un type de génération et vérifier les limites",
  })
  @Post('decrement')
  async decrementCredits(@Req() req, @Body() body: { type: AiGenerationType }) {
    const userId = req.user.sub;
    return this.aiPaymentService.decrementCredits(userId, body.type);
  }

  @Public()
  @ApiOperation({
    summary: "Confirmer un plan publiquement (utilisé pendant l'inscription)",
  })
  @Post('public-confirm-plan')
  async publicConfirmPlan(@Body() body: { userId: number; planId: string }) {
    return this.aiPaymentService.confirmPlan(body.userId, body.planId);
  }
}
