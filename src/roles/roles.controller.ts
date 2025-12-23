import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';

@ApiTags('Roles')
@Controller('roles')
export class RolesController {
    constructor(private readonly rolesService: RolesService) { }

    @ApiOperation({ summary: 'Créer un rôle' })
    @ResponseMessage('Rôle créé avec succès')
    @Post()
    create(@Body() createRoleDto: CreateRoleDto) {
        return this.rolesService.create(createRoleDto);
    }

    @ApiOperation({ summary: 'Lister tous les rôles' })
    @Get()
    findAll() {
        return this.rolesService.findAll();
    }

    @ApiOperation({ summary: 'Récupérer un rôle par ID' })
    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.rolesService.findOne(+id);
    }

    @ApiOperation({ summary: 'Mettre à jour un rôle' })
    @ResponseMessage('Rôle mis à jour avec succès')
    @Patch(':id')
    update(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto) {
        return this.rolesService.update(+id, updateRoleDto);
    }

    @ApiOperation({ summary: 'Supprimer un rôle' })
    @ResponseMessage('Rôle supprimé avec succès')
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.rolesService.remove(+id);
    }
}
