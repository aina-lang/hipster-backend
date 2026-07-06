import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { ClientWebsite } from './entities/client-website.entity';
import { CreateClientWebsiteDto } from './dto/create-client-website.dto';
import { UpdateClientWebsiteDto } from './dto/update-client-website.dto';


@Injectable()
export class ClientWebsitesService {
  constructor(
    @InjectRepository(ClientWebsite)
    private readonly websiteRepo: Repository<ClientWebsite>,
  ) {}

  async create(
    clientId: number,
    dto: CreateClientWebsiteDto,
  ): Promise<ClientWebsite> {
    // Hash password before saving
    const hashedPassword = await bcrypt.hash(dto.adminPassword, 10);

    const website = this.websiteRepo.create({
      ...dto,
      adminPassword: hashedPassword,
      plainPassword: dto.adminPassword, // Store plain password for maintenance tasks
      clientId,
    });

    return this.websiteRepo.save(website);
  }

  async findAllByClient(clientId: number): Promise<ClientWebsite[]> {
    return this.websiteRepo.find({
      where: { clientId },
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(): Promise<ClientWebsite[]> {
    return this.websiteRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number, clientId: number): Promise<ClientWebsite> {
    const website = await this.websiteRepo.findOne({
      where: { id, clientId },
    });

    if (!website) {
      throw new NotFoundException(`Website #${id} not found`);
    }

    return website;
  }

  async update(
    id: number,
    clientId: number,
    dto: UpdateClientWebsiteDto,
  ): Promise<ClientWebsite> {
    const website = await this.findOne(id, clientId);

    // Store plain password for task description before hashing
    let plainPassword = website.plainPassword; // Keep existing if not updating

    // Hash password only if provided
    if (dto.adminPassword) {
      plainPassword = dto.adminPassword; // Store plain version
      dto.adminPassword = await bcrypt.hash(dto.adminPassword, 10);
    }

    Object.assign(website, dto);
    website.plainPassword = plainPassword;
    return this.websiteRepo.save(website);
  }


  async remove(id: number, clientId: number): Promise<{ message: string }> {
    const website = await this.findOne(id, clientId);
    await this.websiteRepo.remove(website);
    return { message: `Website #${id} deleted successfully` };
  }
}
