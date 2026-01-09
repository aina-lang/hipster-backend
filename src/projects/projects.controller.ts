import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Res,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Public } from 'src/common/decorators/public.decorator';
import { Request } from '@nestjs/common';
import type { Response } from 'express';
import { FindProjectsQueryDto } from './dto/find-projects-query.dto';
import { ProjectStatus } from './entities/project.entity';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPaginationQueries } from 'src/common/decorators/api-pagination-query.decorator';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';

@ApiTags('Projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  /**
   * 🧩 Créer un projet
   */
  @ApiOperation({ summary: 'Créer un projet' })
  @ResponseMessage('Projet créé avec succès')
  @Post()
  async create(@Body() createProjectDto: CreateProjectDto, @Request() req) {
    return this.projectsService.create(createProjectDto, req.user.userId);
  }

  /**
   * 📝 Soumettre un projet (Client uniquement)
   */
  @ApiOperation({ summary: 'Soumettre un projet (Client uniquement)' })
  @ResponseMessage('Projet soumis avec succès. En attente de validation.')
  @Post('client/submit')
  async submitClientProject(
    @Body() createProjectDto: CreateProjectDto,
    @Request() req,
  ) {
    return this.projectsService.createClientProject(
      createProjectDto,
      req.user.userId,
    );
  }

  /**
   * 📋 Liste paginée des projets (Mobile App - exclut Maintenance)
   */
  @ApiOperation({ summary: 'Liste paginée des projets pour app mobile' })
  @ApiPaginationQueries([
    { name: 'status', required: false, enum: ProjectStatus },
    { name: 'clientId', required: false, type: Number },
  ])
  @Get()
  async findAll(@Query() query: FindProjectsQueryDto, @Request() req) {
    return this.projectsService.findPaginated(query, req.user.userId);
  }

  /**
   * 📋 Liste paginée de TOUS les projets (Backoffice - inclut Maintenance)
   */
  @ApiOperation({
    summary: 'Liste complète des projets pour backoffice (inclut Maintenance)',
  })
  @ApiPaginationQueries([
    { name: 'status', required: false, enum: ProjectStatus },
    { name: 'clientId', required: false, type: Number },
  ])
  @Get('admin/all')
  async findAllAdmin(@Query() query: FindProjectsQueryDto, @Request() req) {
    return this.projectsService.findPaginatedAdmin(query, req.user.userId);
  }

  /**
   * 🛠️ Obtenir les sites en maintenance d'un client
   */
  @ApiOperation({ summary: 'Liste des sites en maintenance pour un client' })
  @Get('maintenance/client/:clientId')
  async getClientMaintenanceSites(@Param('clientId') clientId: string) {
    return this.projectsService.getClientMaintenanceSites(+clientId);
  }

  /**
   * 🔍 Obtenir un projet par ID
   */
  @ApiOperation({ summary: 'Consulter un projet' })
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.projectsService.findOne(+id);
  }

  /**
   * ✏️ Mise à jour d’un projet
   */
  @ApiOperation({ summary: 'Mettre à jour un projet' })
  @ResponseMessage('Projet mis à jour avec succès')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateProjectDto: UpdateProjectDto,
    @Request() req,
  ) {
    return this.projectsService.update(+id, updateProjectDto, req.user.userId);
  }

  /**
   * ✅ Valider un projet (Admin)
   */
  @ApiOperation({ summary: 'Valider un projet (Admin uniquement)' })
  @ResponseMessage('Projet validé avec succès')
  @Patch(':id/validate')
  async validate(@Param('id') id: string, @Request() req) {
    return this.projectsService.validateProject(+id, req.user.userId);
  }

  /**
   * 🚫 Refuser un projet (Admin)
   */
  @ApiOperation({ summary: 'Refuser un projet (Admin uniquement)' })
  @ResponseMessage('Projet refusé')
  @Patch(':id/refuse')
  async refuse(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @Request() req,
  ) {
    return this.projectsService.refuseProject(
      +id,
      req.user.userId,
      body.reason,
    );
  }

  /**
   * ❌ Annuler un projet
   */
  @ApiOperation({ summary: 'Annuler un projet' })
  @ResponseMessage('Projet annulé avec succès')
  @Patch(':id/cancel')
  async cancel(@Param('id') id: string, @Request() req) {
    return this.projectsService.cancelProject(+id, req.user.userId);
  }

  /**
   * ❌ Suppression d’un projet
   */
  @ApiOperation({ summary: 'Supprimer un projet' })
  @ResponseMessage('Projet supprimé avec succès')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.projectsService.remove(+id);
  }
  /**
   * 🌐 Ajouter un site web au projet
   */
  @ApiOperation({ summary: 'Ajouter un site web au projet' })
  @Post(':id/websites/:websiteId')
  async addWebsite(
    @Param('id') id: string,
    @Param('websiteId') websiteId: string,
  ) {
    return this.projectsService.addWebsite(+id, +websiteId);
  }

  /**
   * 🗑️ Retirer un site web du projet
   */
  @ApiOperation({ summary: 'Retirer un site web du projet' })
  @Delete(':id/websites/:websiteId')
  async removeWebsite(
    @Param('id') id: string,
    @Param('websiteId') websiteId: string,
  ) {
    return this.projectsService.removeWebsite(+id, +websiteId);
  }

  /**
   * 📅 Mettre à jour la planification globale du projet
   */
  @ApiOperation({ summary: 'Mettre à jour la planification globale du projet' })
  @Post(':id/schedule')
  async updateSchedule(
    @Param('id') id: string,
    @Body()
    schedule: {
      recurrenceType: string;
      recurrenceInterval?: number;
      recurrenceDays?: string[];
    },
  ) {
    return this.projectsService.updateProjectSchedule(+id, schedule);
  }

  /**
   * 📄 Générer le rapport PDF du projet
   */
  @ApiOperation({ summary: 'Générer le rapport PDF du projet' })
  @Get(':id/pdf')
  async generatePdf(
    @Param('id') id: string,
    @Request() req,
    @Res() res: Response,
  ) {
    const buffer = await this.projectsService.generatePdf(+id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=project-report-${id}.pdf`,
      'Content-Length': buffer.length.toString(),
    });

    res.end(buffer);
  }
}
