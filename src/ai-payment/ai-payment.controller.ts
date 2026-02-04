import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { AiPaymentService } from './ai-payment.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('AI-Payment')
@Controller('ai/payment')
@UseGuards(AuthGuard('jwt-ai'))
@ApiBearerAuth()
export class AiPaymentController {
  constructor(private readonly aiPaymentService: AiPaymentService) {}

  @ApiOperation({ summary: 'Créer une feuille de paiement Stripe pour IA' })
  @Post('create-payment-sheet')
  async createPaymentSheet(
    @Req() req,
    @Body() body: { priceId: string; userId?: number },
  ) {
    const userId = body.userId || req.user.sub;
    return this.aiPaymentService.createPaymentSheet(userId, body.priceId);
  }
}
