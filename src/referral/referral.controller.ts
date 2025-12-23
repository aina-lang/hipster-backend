import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { AuthGuard } from 'src/common/guards/auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';

@ApiTags('Referral')
@Controller('referral')
@UseGuards(AuthGuard)
export class ReferralController {
    constructor(private readonly referralService: ReferralService) { }

    @ApiOperation({ summary: 'Récupérer toutes les statistiques de parrainage (Admin)' })
    @Get('admin/all-stats')
    getAllStats() {
        return this.referralService.getAllReferralStats();
    }

    @ApiOperation({ summary: 'Récupérer les statistiques de parrainage de l’utilisateur connecté' })
    @Get('stats')
    getStats(@User() user: any) {
        return this.referralService.getReferralStats(user.sub);
    }

    @ApiOperation({ summary: 'Appliquer un code de parrainage' })
    @ResponseMessage('Code de parrainage appliqué avec succès')
    @Post('apply')
    applyCode(@User() user: any, @Body('code') code: string) {
        return this.referralService.applyReferralCode(user.sub, code);
    }
}
