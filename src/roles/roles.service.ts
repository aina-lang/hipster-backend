import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleEntity } from './entities/role.entity';
import { Permission } from '../permissions/entities/permission.entity';

@Injectable()
export class RolesService {
    constructor(
        @InjectRepository(RoleEntity)
        private roleRepo: Repository<RoleEntity>,
        @InjectRepository(Permission)
        private permissionRepo: Repository<Permission>,
    ) { }

    async create(createRoleDto: CreateRoleDto) {
        const { permissionIds, ...roleData } = createRoleDto;
        const role = this.roleRepo.create(roleData);

        if (permissionIds && permissionIds.length > 0) {
            const permissions = await this.permissionRepo.findBy({
                id: In(permissionIds),
            });
            role.permissions = permissions;
        }

        return this.roleRepo.save(role);
    }

    findAll() {
        return this.roleRepo.find({ relations: ['permissions'] });
    }

    findOne(id: number) {
        return this.roleRepo.findOne({
            where: { id },
            relations: ['permissions'],
        });
    }

    async update(id: number, updateRoleDto: UpdateRoleDto) {
        const { permissionIds, ...roleData } = updateRoleDto;
        const role = await this.findOne(id);

        if (!role) {
            throw new Error('Role not found');
        }

        Object.assign(role, roleData);

        if (permissionIds) {
            const permissions = await this.permissionRepo.findBy({
                id: In(permissionIds),
            });
            role.permissions = permissions;
        }

        return this.roleRepo.save(role);
    }

    remove(id: number) {
        return this.roleRepo.delete(id);
    }
}
