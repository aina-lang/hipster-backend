import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleEntity } from './entities/role.entity';


@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(RoleEntity)
    private roleRepo: Repository<RoleEntity>,
  ) {}

  async create(createRoleDto: CreateRoleDto) {
    const role = this.roleRepo.create(createRoleDto);
    return this.roleRepo.save(role);
  }

  findAll() {
    return this.roleRepo.find();
  }

  findOne(id: number) {
    return this.roleRepo.findOne({ where: { id } });
  }

  async update(id: number, updateRoleDto: UpdateRoleDto) {
    const role = await this.findOne(id);
    if (!role) throw new Error('Role not found');
    Object.assign(role, updateRoleDto);
    return this.roleRepo.save(role);
  }

  remove(id: number) {
    return this.roleRepo.delete(id);
  }

  // 🔹 DELETE MULTIPLE
  async removeMany(ids: number[]): Promise<{ deleted: number; notFound: number[] }> {
    const roles = await this.roleRepo.find({ where: { id: In(ids) } });
    const foundIds = roles.map((r) => r.id);
    const notFound = ids.filter((id) => !foundIds.includes(id));
    if (roles.length) await this.roleRepo.remove(roles);
    return { deleted: roles.length, notFound };
  }
}
