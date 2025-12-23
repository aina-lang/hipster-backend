import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  ParseIntPipe,
  UseGuards,
  Body,
} from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { AuthGuard } from 'src/common/guards/auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';

@ApiTags('Maintenance')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @ApiOperation({ summary: 'Récupérer le projet de maintenance global' })
  @Get('project')
  getMaintenanceProject(@User() user: any) {
    return this.maintenanceService.getMaintenanceProject(user.sub);
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

  @ApiOperation({ summary: 'Retirer un site web de la maintenance' })
  @ResponseMessage('Site retiré de la maintenance')
  @Delete('websites/:id')
  removeWebsiteFromMaintenance(@Param('id', ParseIntPipe) id: number) {
    return this.maintenanceService.removeWebsiteFromMaintenance(id);
  }

  @ApiOperation({ summary: 'Lister tous les sites en maintenance' })
  @Get('websites')
  getMaintenanceWebsites() {
    return this.maintenanceService.getMaintenanceWebsites();
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

  @ApiOperation({ summary: 'Marquer la maintenance comme terminée pour un site' })
  @ResponseMessage('Maintenance marquée comme terminée')
  @Post('websites/:id/complete')
  completeWebsiteMaintenance(
    @Param('id', ParseIntPipe) id: number,
    @User() user: any,
  ) {
    return this.maintenanceService.completeWebsiteMaintenance(id, user.sub);
  }
}
