import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  ParseIntPipe,
  UseGuards,
  Body,
  ForbiddenException,
} from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { AuthGuard } from 'src/common/guards/auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { BulkDeleteDto } from 'src/common/dto/bulk-delete.dto';
import { Roles } from 'src/common/decorators/role.decorator';
import { Role } from 'src/common/enums/role.enum';
import { UpdateMaintenancePricingDto } from './dto/update-maintenance-pricing.dto';
import { isMaintenancePricingAdmin } from 'src/common/utils/roles.utils';

@ApiTags('Maintenance')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  /** 🔒 Les tarifs de maintenance ne sont visibles que par l'admin habilité. */
  private assertPricingAdmin(user: any) {
    if (!isMaintenancePricingAdmin(user)) {
      throw new ForbiddenException(
        'Seul le compte administrateur habilité peut consulter les tarifs de maintenance.',
      );
    }
  }

  @ApiOperation({ summary: 'Récupérer le projet de maintenance global' })
  @Get('project')
  getMaintenanceProject(@User() user: any) {
    return this.maintenanceService.getMaintenanceProject(
      user.sub,
      isMaintenancePricingAdmin(user),
    );
  }

  @ApiOperation({
    summary: 'Mettre TOUS les sites clients en maintenance (admin)',
  })
  @ResponseMessage('Tous les sites ont été mis en maintenance')
  @Roles(Role.ADMIN)
  @Post('websites/all')
  addAllWebsitesToMaintenance(@User() user: any) {
    return this.maintenanceService.addAllWebsitesToMaintenance(user.sub);
  }

  @ApiOperation({ summary: 'Ajouter un site web à la maintenance' })
  @ResponseMessage('Site ajouté à la maintenance')
  @Post('websites/:id')
  addWebsiteToMaintenance(
    @Param('id', ParseIntPipe) id: number,
    @User() user: any,
  ) {
    return this.maintenanceService.addWebsiteToMaintenance(id, user.sub);
  }

  @ApiOperation({ summary: 'Retirer plusieurs sites web de la maintenance' })
  @ResponseMessage('Sites retirés de la maintenance')
  @Delete('websites/bulk')
  removeManyWebsitesFromMaintenance(@Body() dto: BulkDeleteDto) {
    return this.maintenanceService.removeWebsitesFromMaintenance(dto.ids);
  }

  @ApiOperation({ summary: 'Retirer un site web de la maintenance' })
  @ResponseMessage('Site retiré de la maintenance')
  @Delete('websites/:id')
  removeWebsiteFromMaintenance(@Param('id', ParseIntPipe) id: number) {
    return this.maintenanceService.removeWebsiteFromMaintenance(id);
  }

  @ApiOperation({ summary: 'Lister tous les sites en maintenance' })
  @Get('websites')
  getMaintenanceWebsites(@User() user: any) {
    return this.maintenanceService.getMaintenanceWebsites(
      isMaintenancePricingAdmin(user),
    );
  }

  @ApiOperation({
    summary: 'Récapitulatif des tarifs de maintenance (admin Lise uniquement)',
  })
  @Roles(Role.ADMIN)
  @Get('pricing')
  getPricingOverview(@User() user: any) {
    this.assertPricingAdmin(user);
    return this.maintenanceService.getPricingOverview();
  }

  @ApiOperation({
    summary: "Modifier le tarif de maintenance d'un site (admin Lise uniquement)",
  })
  @ResponseMessage('Tarif mis à jour')
  @Roles(Role.ADMIN)
  @Patch('websites/:id/pricing')
  updateWebsitePricing(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMaintenancePricingDto,
    @User() user: any,
  ) {
    this.assertPricingAdmin(user);
    return this.maintenanceService.updateWebsitePricing(id, dto);
  }
  @ApiOperation({ summary: 'Mettre à jour la planification globale' })
  @ResponseMessage('Planification globale mise à jour')
  @Post('schedule')
  updateGlobalSchedule(@Body() schedule: any, @User() user: any) {
    return this.maintenanceService.updateGlobalSchedule(user.sub, schedule);
  }

  @ApiOperation({ summary: 'Récupérer les statistiques de maintenance' })
  @Get('project/:id/stats')
  getMaintenanceStats(@Param('id', ParseIntPipe) id: number) {
    return this.maintenanceService.getMaintenanceStats(id);
  }

  @ApiOperation({
    summary: 'Marquer la maintenance comme terminée pour un site',
  })
  @ResponseMessage('Maintenance marquée comme terminée')
  @Post('websites/:id/complete')
  completeWebsiteMaintenance(
    @Param('id', ParseIntPipe) id: number,
    @User() user: any,
  ) {
    return this.maintenanceService.completeWebsiteMaintenance(id, user.sub);
  }
}
