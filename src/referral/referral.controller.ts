import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { AuthGuard } from 'src/common/guards/auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { ApiOperation, ApiTags, ApiResponse, ApiBody } from '@nestjs/swagger';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { ApplyReferralDto, ReferralStatsDto } from './dto/referral.dto';

@ApiTags('Referral')
@Controller('referral')
@UseGuards(AuthGuard)
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @ApiOperation({
    summary: 'Récupérer toutes les statistiques de parrainage (Admin)',
    description: 'Permet aux administrateurs de voir les performances de parrainage de tous les utilisateurs.',
  })
  @ApiResponse({ status: 200, description: 'Liste des statistiques récupérée avec succès' })
  @Get('admin/all-stats')
  getAllStats() {
    return this.referralService.getAllReferralStats();
  }

  @ApiOperation({
    summary:
      'Récupérer les statistiques de parrainage de l’utilisateur connecté',
    description: 'Retourne le code de parrainage, le nombre de filleuls actifs, le statut ambassadeur et les mois gratuits en attente.',
  })
  @ApiResponse({ status: 200, type: ReferralStatsDto })
  @Get('stats')
  getStats(@User() user: any) {
    return this.referralService.getReferralStats(user.sub);
  }

  @ApiOperation({ 
    summary: 'Appliquer un code de parrainage',
    description: 'Lie l’utilisateur actuel à un parrain via son code. Ne fonctionne que si l’utilisateur n’a pas déjà de parrain.'
  })
  @ApiBody({ type: ApplyReferralDto })
  @ApiResponse({ status: 201, description: 'Code appliqué avec succès' })
  @ApiResponse({ status: 400, description: 'L’utilisateur a déjà un parrain ou code invalide' })
  @ResponseMessage('Code de parrainage appliqué avec succès')
  @Post('apply')
  applyCode(@User() user: any, @Body() dto: ApplyReferralDto) {
    return this.referralService.applyReferralCode(user.sub, dto.code);
  }
}
