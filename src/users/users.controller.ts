import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { AiAuthService } from '../ai-auth/ai-auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from 'src/common/enums/role.enum';
import { FindUsersQueryDto } from './dto/find-users-query.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPaginationQueries } from 'src/common/decorators/api-pagination-query.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';

import { User } from 'src/common/decorators/user.decorator';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly aiAuthService: AiAuthService,
  ) {}

  // 🔹 Profil de l'utilisateur connecté
  @ApiOperation({ summary: "Récupérer le profil de l'utilisateur connecté" })
  @Get('me')
  async getMe(@User() user: any) {
    if (user.type === 'ai') {
      return this.aiAuthService.updateProfile(user.sub, {});
    }
    return this.usersService.findOne(user.sub);
  }

  @ApiOperation({
    summary: "Mettre à jour le profil de l'utilisateur connecté",
  })
  @ResponseMessage('Profil mis à jour avec succès')
  @Patch('me')
  async updateMe(@User() user: any, @Body() dto: UpdateUserProfileDto) {
    console.log(
      '[UsersController] updateMe called for user type:',
      user.type,
      'DTO:',
      JSON.stringify(dto, null, 2),
    );
    if (user.type === 'ai') {
      return this.aiAuthService.updateProfile(user.sub, dto);
    }
    return this.usersService.update(user.sub, dto);
  }

  @ApiOperation({
    summary: "Initier le changement d'email (envoie OTP à l'email actuel)",
  })
  @Post('me/email/request')
  async requestEmailChange(@User() user: any) {
    return this.authService.requestEmailChange(user.sub);
  }

  @ApiOperation({
    summary: "Vérifier l'OTP de l'email actuel et envoyer OTP au nouvel email",
  })
  @Post('me/email/verify-current')
  async verifyCurrentEmailOtp(
    @User() user: any,
    @Body() dto: { code: string; newEmail: string },
  ) {
    return this.authService.verifyCurrentEmailOtp(
      user.sub,
      dto.code,
      dto.newEmail,
    );
  }

  @ApiOperation({ summary: "Confirmer le nouvel email avec l'OTP reçu" })
  @Post('me/email/verify-new')
  async confirmNewEmailOtp(@User() user: any, @Body() dto: { code: string }) {
    return this.authService.confirmNewEmailOtp(user.sub, dto.code);
  }

  @ApiOperation({ summary: "Uploader un avatar pour l'utilisateur connecté" })
  @ResponseMessage('Avatar mis à jour avec succès')
  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          cb(null, process.env.UPLOAD_PATH || join(process.cwd(), 'uploads'));
        },
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
  async uploadMyAvatar(
    @User() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Fichier manquant');
    }

    const avatarUrl = `/uploads/${file.filename}`;
    if (user.type === 'ai') {
      return this.aiAuthService.updateProfile(user.sub, { avatarUrl });
    }
    return this.usersService.update(user.sub, { avatarUrl });
  }

  // 🔹 Créer un utilisateur
  @Public()
  @ApiOperation({ summary: 'Créer un utilisateur' })
  @ResponseMessage('Utilisateur créé avec succès')
  @Post()
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  // 🔹 Liste paginée + filtrée (tous rôles confondus)
  @ApiOperation({ summary: 'Liste paginée de tous les utilisateurs' })
  @ApiPaginationQueries([
    { name: 'role', required: false, enum: Role },
    { name: 'isActive', required: false, type: Boolean },
  ])
  @Get('')
  async findAll(@Query() query: FindUsersQueryDto) {
    return this.usersService.findPaginated(query);
  }

  // 🔹 Liste paginée + filtrée des CLIENTS
  @ApiOperation({ summary: 'Liste paginée des clients' })
  @ApiPaginationQueries([{ name: 'isActive', required: false, type: Boolean }])
  @Get('clients')
  async findClients(@Query() query: FindUsersQueryDto) {
    return this.usersService.findPaginated({
      ...query,
      role: Role.CLIENT_MARKETING,
    });
  }

  // 🔹 Liste paginée + filtrée des EMPLOYÉS
  @ApiOperation({ summary: 'Liste paginée des employés' })
  @ApiPaginationQueries([{ name: 'isActive', required: false, type: Boolean }])
  @Get('employees')
  async findEmployees(@Query() query: FindUsersQueryDto) {
    return this.usersService.findPaginated({
      ...query,
      role: Role.EMPLOYEE,
    });
  }

  // 🔹 Liste paginée + filtrée des ADMINISTRATEURS
  @ApiOperation({ summary: 'Liste paginée des administrateurs' })
  @ApiPaginationQueries([{ name: 'isActive', required: false, type: Boolean }])
  @Get('admins')
  async findAdmins(@Query() query: FindUsersQueryDto) {
    return this.usersService.findPaginated({
      ...query,
      role: Role.ADMIN,
    });
  }

  // 🔹 Un utilisateur spécifique
  @ApiOperation({ summary: 'Récupérer un utilisateur par ID' })
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }

  // 🔹 Mise à jour
  @ApiOperation({ summary: 'Mettre à jour un utilisateur' })
  @ResponseMessage('Utilisateur mis à jour avec succès')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(+id, dto);
  }

  // 🔹 Suppression
  @ApiOperation({ summary: 'Supprimer un utilisateur' })
  @ResponseMessage('Utilisateur supprimé avec succès')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.usersService.remove(+id);
  }

  // 🔹 Assign roles and permissions to user
  @ApiOperation({ summary: 'Assigner des accès à un utilisateur' })
  @ResponseMessage('Accès assignés avec succès')
  @Post(':id/access')
  async assignAccess(@Param('id') id: string, @Body() dto: any) {
    return this.usersService.assignAccess(+id, dto);
  }

  // 🔹 Get user access details
  @ApiOperation({ summary: 'Récupérer les accès d’un utilisateur' })
  @Get(':id/access')
  async getUserAccess(@Param('id') id: string) {
    return this.usersService.getUserAccess(+id);
  }

  // 🔹 Upload Avatar
  @ApiOperation({ summary: 'Uploader un avatar' })
  @ResponseMessage('Avatar mis à jour avec succès')
  @Post(':id/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          cb(null, process.env.UPLOAD_PATH || join(process.cwd(), 'uploads'));
        },
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
  async uploadAvatar(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Fichier manquant');
    }

    const avatarUrl = `/uploads/${file.filename}`;
    return this.usersService.update(+id, { avatarUrl });
  }

  // 🔹 Regenerate password
  @ApiOperation({ summary: 'Regénérer le mot de passe d’un utilisateur' })
  @ResponseMessage('Mot de passe régénéré avec succès')
  @Post(':id/regenerate-password')
  async regeneratePassword(@Param('id') id: string) {
    return this.usersService.regeneratePassword(+id);
  }
}
