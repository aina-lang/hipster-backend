import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Patch,
  Delete,
  Query,
  UseGuards,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { ClientWebsitesService } from './client-websites.service';
import { CreateClientProfileDto } from './dto/create-client-profile.dto';
import { UpdateClientProfileDto } from './dto/update-client-profile.dto';
import { CreateEmployeeProfileDto } from './dto/create-employee-profile.dto';
import { UpdateEmployeeProfileDto } from './dto/update-employee-profile.dto';

import { UpdateAiProfileDto } from './dto/update-ai-profile.dto';
import { CreateIaClientProfileDto } from './dto/create-ia-client-profile.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from 'src/common/guards/auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';

@ApiTags('Profiles')
@ApiBearerAuth()
@Controller('profiles')
export class ProfilesController {
  constructor(
    private readonly profilesService: ProfilesService,
    private readonly clientWebsitesService: ClientWebsitesService,
  ) {}

  // --------------------
  // CLIENT PROFILE
  // --------------------
  @Public()
  @ApiOperation({ summary: 'Créer un profil client (Admin ou Public)' })
  @ResponseMessage('Profil client créé avec succès')
  @Post('client')
  createClient(@Body() dto: CreateClientProfileDto) {
    return this.profilesService.createClientProfile(dto);
  }

  @ApiOperation({
    summary: 'Activer le profil client pour l’utilisateur connecté',
  })
  @UseGuards(AuthGuard)
  @ResponseMessage('Profil client activé avec succès')
  @Post('client/activate')
  activateClient(@User() user: any, @Body() dto: CreateClientProfileDto) {
    return this.profilesService.createClientProfile({
      ...dto,
      userId: user.sub,
    });
  }

  @ApiOperation({
    summary: 'Lister tous les profils client avec pagination et filtres',
  })
  @Get('clients')
  findAllClients(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('clientType') clientType?: string,
    @Query('search') search?: string,
  ) {
    return this.profilesService.findAllClients(
      page ? +page : 1,
      limit ? +limit : 10,
      clientType as any,
      search,
    );
  }

  @ApiOperation({ summary: 'Récupérer un profil client par ID' })
  @Get('client/:id')
  findClient(@Param('id') id: string) {
    return this.profilesService.findClientById(+id);
  }

  @ApiOperation({ summary: 'Récupérer un profil client par User ID' })
  @Get('client/user/:userId')
  findClientByUserId(@Param('userId') userId: string) {
    return this.profilesService.findClientByUserId(+userId);
  }

  @ApiOperation({ summary: 'Mettre à jour un profil client' })
  @ResponseMessage('Profil client mis à jour avec succès')
  @Patch('client/:id')
  updateClient(@Param('id') id: string, @Body() dto: UpdateClientProfileDto) {
    return this.profilesService.updateClientProfile(+id, dto);
  }

  @ApiOperation({ summary: 'Supprimer un profil client' })
  @ResponseMessage('Profil client supprimé avec succès')
  @Delete('client/:id')
  removeClient(@Param('id') id: string) {
    return this.profilesService.removeClientProfile(+id);
  }

  // --------------------
  // EMPLOYEE PROFILE
  // --------------------
  @ApiOperation({ summary: 'Créer un profil employé (Admin)' })
  @ResponseMessage('Profil employé créé avec succès')
  @Post('employee')
  createEmployee(@Body() dto: CreateEmployeeProfileDto) {
    return this.profilesService.createEmployeeProfile(dto);
  }

  @ApiOperation({
    summary: 'Activer le profil employé pour l’utilisateur connecté',
  })
  @UseGuards(AuthGuard)
  @ResponseMessage('Profil employé activé avec succès')
  @Post('employee/activate')
  activateEmployee(@User() user: any, @Body() dto: CreateEmployeeProfileDto) {
    return this.profilesService.createEmployeeProfile(dto, user.sub);
  }

  @ApiOperation({ summary: 'Lister tous les profils employé' })
  @Get('employees')
  findAllEmployees() {
    return this.profilesService.findAllEmployees();
  }

  @ApiOperation({ summary: 'Récupérer un profil employé' })
  @Get('employee/:id')
  findEmployee(@Param('id') id: string) {
    return this.profilesService.findEmployeeById(+id);
  }

  @ApiOperation({ summary: 'Mettre à jour un profil employé' })
  @ResponseMessage('Profil employé mis à jour avec succès')
  @Patch('employee/:id')
  updateEmployee(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeProfileDto,
  ) {
    return this.profilesService.updateEmployeeProfile(+id, dto);
  }

  @ApiOperation({ summary: 'Supprimer un profil employé' })
  @ResponseMessage('Profil employé supprimé avec succès')
  @Delete('employee/:id')
  removeEmployee(@Param('id') id: string) {
    return this.profilesService.removeEmployeeProfile(+id);
  }

  // --------------------
  // AI SUBSCRIPTION PROFILE
  // --------------------
  @ApiOperation({ summary: 'Créer un profil IA / abonnement (Admin)' })
  @ResponseMessage('Profil IA créé avec succès')
  @Post('ai')
  createAi(@Body() dto: CreateIaClientProfileDto) {
    return this.profilesService.createAiProfile(dto);
  }

  @ApiOperation({ summary: 'Activer le profil IA pour l’utilisateur connecté' })
  @UseGuards(AuthGuard)
  @ResponseMessage('Profil IA activé avec succès')
  @Post('ai/activate')
  activateAi(@User() user: any, @Body() dto: CreateIaClientProfileDto) {
    return this.profilesService.createAiProfile({ ...dto, userId: user.sub });
  }

  @ApiOperation({ summary: 'Lister tous les profils IA' })
  @Get('ai')
  findAllAi() {
    return this.profilesService.findAllAiProfiles();
  }

  @ApiOperation({ summary: 'Récupérer un profil IA' })
  @Get('ai/:id')
  findAi(@Param('id') id: string) {
    return this.profilesService.findAiProfileById(+id);
  }

  @ApiOperation({ summary: 'Mettre à jour un profil IA' })
  @ResponseMessage('Profil IA mis à jour avec succès')
  @Patch('ai/:id')
  updateAi(@Param('id') id: string, @Body() dto: UpdateAiProfileDto) {
    return this.profilesService.updateAiProfile(+id, dto);
  }

  @ApiOperation({ summary: 'Supprimer un profil IA' })
  @ResponseMessage('Profil IA supprimé avec succès')
  @Delete('ai/:id')
  removeAi(@Param('id') id: string) {
    return this.profilesService.removeAiProfile(+id);
  }

  @ApiOperation({ summary: 'Uploader un logo pour le profil IA' })
  @ResponseMessage('Logo mis à jour avec succès')
  @Post('ai/:id/logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads'),
        filename: (req, file, cb) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async uploadAiLogo(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Fichier manquant');
    }

    const logoUrl = `/uploads/${file.filename}`;
    return this.profilesService.updateAiProfile(+id, { logoUrl } as any);
  }

  // --------------------
  // GLOBAL WEBSITES
  // --------------------
  @ApiOperation({ summary: 'Lister tous les sites web (Global)' })
  @Get('websites')
  findAllWebsites() {
    return this.clientWebsitesService.findAll();
  }
}
