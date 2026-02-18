import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
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
  @Public()
  @Post('create-payment-sheet')
  async createPaymentSheet(
    @Req() req: any,
    @Body() body: { priceId?: string; userId?: number; planId?: string },
  ) {
    try {
      console.log('[AiPaymentController] createPaymentSheet called');
      console.log('[AiPaymentController] Body:', JSON.stringify(body, null, 2));
      console.log('[AiPaymentController] req.user:', req.user);

      const userId = body.userId || req.user?.sub;

      if (!userId) {
        console.error('[AiPaymentController] No userId found - body.userId:', body.userId, 'req.user.sub:', req.user?.sub);
        throw new BadRequestException('userId is required in body or as authenticated user');
      }

      console.log('[AiPaymentController] Using userId:', userId, ', priceId:', body.priceId, ', planId:', body.planId);

      const result = await this.aiPaymentService.createPaymentSheet(
        userId,
        body.priceId,
        body.planId,
      );

      console.log('[AiPaymentController] Payment sheet created successfully');
      return result;
    } catch (error: any) {
      console.error('[AiPaymentController] Error creating payment sheet:', error.message);
      throw error;
    }
  }

  @ApiOperation({ summary: 'Annuler mon abonnement' })
  @Post('cancel')
  async cancelSubscription(@Req() req) {
    const userId = req.user.sub;
    return this.aiPaymentService.cancelSubscription(userId);
  }

  @ApiOperation({ summary: 'Changer de plan (upgrade/downgrade)' })
  @Post('switch-plan')
  async switchPlan(@Req() req, @Body() body: { newPlanId: string }) {
    const userId = req.user.sub;
    return this.aiPaymentService.switchPlan(userId, body.newPlanId);
  }

  @ApiOperation({
    summary: "Confirmer un plan et appliquer les limites d'utilisation",
  })
  @Post('confirm-plan')
  async confirmPlan(
    @Req() req: any,
    @Body() body: { planId: string; subscriptionId?: string },
  ) {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        console.error('[AiPaymentController] confirm-plan: No userId found in token');
        throw new BadRequestException('User not authenticated');
      }
      
      console.log('[AiPaymentController] confirm-plan: userId:', userId, 'planId:', body.planId);
      return this.aiPaymentService.confirmPlan(
        userId,
        body.planId,
        body.subscriptionId,
      );
    } catch (error: any) {
      console.error('[AiPaymentController] confirm-plan error:', error.message);
      throw error;
    }
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
