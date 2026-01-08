import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { ClientWebsite } from './entities/client-website.entity';
import { CreateClientWebsiteDto } from './dto/create-client-website.dto';
import { UpdateClientWebsiteDto } from './dto/update-client-website.dto';
import { Task } from '../tasks/entities/task.entity';

@Injectable()
export class ClientWebsitesService {
  constructor(
    @InjectRepository(ClientWebsite)
    private readonly websiteRepo: Repository<ClientWebsite>,
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
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
    website.plainPassword = plainPassword; // Update plain password field

    const updatedWebsite = await this.websiteRepo.save(website);

    // Update associated maintenance task if exists
    await this.updateMaintenanceTask(updatedWebsite, clientId);

    return updatedWebsite;
  }

  private async updateMaintenanceTask(
    website: ClientWebsite,
    clientId: number,
  ): Promise<void> {
    try {
      // Find maintenance task for this website
      const task = await this.taskRepo.findOne({
        where: { websiteId: website.id },
        relations: ['project'],
      });

      if (task) {
        // Get client info for description
        const clientWebsite = await this.websiteRepo.findOne({
          where: { id: website.id },
          relations: ['client', 'client.user'],
        });

        const clientName = clientWebsite?.client?.user
          ? `${clientWebsite.client.user.firstName} ${clientWebsite.client.user.lastName}`
          : 'Client inconnu';

        // Update task title and description
        task.title = `${website.url} - ${clientName}`;
        task.description = `Maintenance du site WordPress\nURL: ${website.url}\nLogin: ${website.adminLogin}\nPassword: ${website.plainPassword || '[Non modifié]'}\nClient: ${clientName}`;

        await this.taskRepo.save(task);
      }
    } catch (error) {
      console.error('Error updating maintenance task:', error);
      // Don't throw error, just log it
    }
  }

  async remove(id: number, clientId: number): Promise<{ message: string }> {
    const website = await this.findOne(id, clientId);
    await this.websiteRepo.remove(website);
    return { message: `Website #${id} deleted successfully` };
  }
}
