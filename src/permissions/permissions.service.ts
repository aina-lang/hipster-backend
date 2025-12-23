import { Injectable } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { Permission } from './entities/permission.entity';
import { seedPermissions } from './seed-permissions';

@Injectable()
export class PermissionsService {
    constructor(
        @InjectRepository(Permission)
        private permissionRepo: Repository<Permission>,
        @InjectDataSource()
        private dataSource: DataSource,
    ) { }

    create(createPermissionDto: CreatePermissionDto) {
        const permission = this.permissionRepo.create(createPermissionDto);
        return this.permissionRepo.save(permission);
    }

    findAll() {
        return this.permissionRepo.find();
    }

    findOne(id: number) {
        return this.permissionRepo.findOne({ where: { id } });
    }

    async update(id: number, updatePermissionDto: UpdatePermissionDto) {
        await this.permissionRepo.update(id, updatePermissionDto);
        return this.findOne(id);
    }

    remove(id: number) {
        return this.permissionRepo.delete(id);
    }

    /**
     * Seed default permissions for all modules
     */
    async seedDefaultPermissions() {
        return await seedPermissions(this.dataSource);
    }
}
