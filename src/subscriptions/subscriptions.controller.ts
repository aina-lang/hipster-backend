import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';

@ApiTags('Subscriptions')
@Controller('subscriptions')
@UseGuards(AuthGuard('jwt'))
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @ApiOperation({ summary: 'Récupérer mon profil d\'abonnement' })
  @Get('me')
  async getMySubscription(@Req() req) {
    return this.subscriptionsService.getSubscriptionProfile(req.user.sub);
  }

  @ApiOperation({ summary: 'Lister les plans d\'abonnement' })
  @Get('plans')
  async getPlans() {
    return this.subscriptionsService.getPlans();
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
}
