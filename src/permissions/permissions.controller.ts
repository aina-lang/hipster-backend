import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';

@ApiTags('Permissions')
@Controller('permissions')
export class PermissionsController {
    constructor(private readonly permissionsService: PermissionsService) { }

    @ApiOperation({ summary: 'Créer une permission' })
    @ResponseMessage('Permission créée avec succès')
    @Post()
    create(@Body() createPermissionDto: CreatePermissionDto) {
        return this.permissionsService.create(createPermissionDto);
    }

    @ApiOperation({ summary: 'Lister toutes les permissions' })
    @Get()
    findAll() {
        return this.permissionsService.findAll();
    }

    @ApiOperation({ summary: 'Récupérer une permission par ID' })
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.permissionsService.findOne(+id);
    }

    @ApiOperation({ summary: 'Mettre à jour une permission' })
    @ResponseMessage('Permission mise à jour avec succès')
    @Patch(':id')
    update(@Param('id') id: string, @Body() updatePermissionDto: UpdatePermissionDto) {
        return this.permissionsService.update(+id, updatePermissionDto);
    }

    @ApiOperation({ summary: 'Supprimer une permission' })
    @ResponseMessage('Permission supprimée avec succès')
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.permissionsService.remove(+id);
    }

    @ApiOperation({ summary: 'Générer toutes les permissions par défaut pour tous les modules' })
    @ResponseMessage('Permissions générées avec succès')
    @Post('seed')
    async seedDefaultPermissions() {
        const result = await this.permissionsService.seedDefaultPermissions();
        return {
            message: 'Permissions générées avec succès',
            ...result,
        };
    }
}
