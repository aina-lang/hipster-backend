import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { AuthGuard } from 'src/common/guards/auth.guard';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Loyalty')
@Controller('loyalty')
@UseGuards(AuthGuard)
export class LoyaltyController {
    constructor(private readonly loyaltyService: LoyaltyService) { }

    @ApiOperation({ summary: 'Récupérer tous les statuts de fidélité' })
    @Get('')
    getAll() {
        return this.loyaltyService.getAllLoyaltyStatuses();
    }

    @ApiOperation({ summary: 'Récupérer le détail de fidélité d’un client' })
    @Get(':clientId/detail')
    getClientDetail(@Param('clientId', ParseIntPipe) clientId: number) {
        return this.loyaltyService.getClientLoyaltyDetail(clientId);
    }

    @ApiOperation({ summary: 'Récupérer le statut de fidélité d’un client' })
    @Get(':clientId')
    getLoyaltyStatus(@Param('clientId', ParseIntPipe) clientId: number) {
        return this.loyaltyService.getLoyaltyStatus(clientId);
    }
}
