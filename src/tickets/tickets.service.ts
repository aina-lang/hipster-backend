import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { Ticket } from './entities/ticket.entity';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { Project } from 'src/projects/entities/project.entity';
import { QueryTicketsDto } from './dto/query-tickets.dto';
import { PaginatedResult } from 'src/common/types/paginated-result.type';
import { User } from 'src/users/entities/user.entity';
import { NotificationsService } from 'src/notifications/notifications.service';
import { MailService } from 'src/mail/mail.service';
import { In } from 'typeorm';

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,
    @InjectRepository(ClientProfile)
    private readonly clientRepo: Repository<ClientProfile>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
  ) {}

  async create(dto: CreateTicketDto): Promise<Ticket> {
    const client = await this.clientRepo.findOneBy({ id: dto.clientId });
    if (!client) {
      throw new NotFoundException(`Client #${dto.clientId} introuvable`);
    }

    let project: Project | undefined;
    if (dto.projectId) {
      const projectEntity = await this.projectRepo.findOneBy({
        id: dto.projectId,
      });
      if (!projectEntity)
        throw new NotFoundException(`Projet #${dto.projectId} introuvable`);
      project = projectEntity;
    }

    const ticket = this.ticketRepo.create({
      subject: dto.subject,
      description: dto.description,
      priority: dto.priority,
      status: dto.status,
      client,
      project,
    });

    const savedTicket = await this.ticketRepo.save(ticket);

    // ✅ Notify all admins about new ticket creation
    try {
      // Get client user info
      const clientWithUser = await this.clientRepo.findOne({
        where: { id: client.id },
        relations: ['user'],
      });

      if (clientWithUser?.user) {
        // Get all admin users
        const admins = await this.userRepo.find({
          where: { roles: In(['admin']) },
        });
        const adminIds = admins.map(a => a.id);

        // Send real-time + email notifications to admins
        await this.notificationsService.createTicketNotification(
          savedTicket.id,
          savedTicket.subject,
          client.id,
          adminIds,
        );

        // Send individual emails
        for (const admin of admins) {
          if (admin.email) {
            await this.mailService.sendTicketCreationEmail(
              admin.email,
              {
                adminName: `${admin.firstName} ${admin.lastName}`,
                ticketTitle: savedTicket.subject,
                clientName: `${clientWithUser.user.firstName} ${clientWithUser.user.lastName}`,
                ticketDescription: savedTicket.description,
                priority: savedTicket.priority,
              },
            );
          }
        }
      }
    } catch (error) {
      console.error('Failed to send ticket creation notifications:', error);
    }

    return savedTicket;
  }

  async findPaginated(
    query: QueryTicketsDto,
  ): Promise<PaginatedResult<Ticket>> {
    const {
      page = 1,
      limit = 25,
      search,
      status,
      priority,
      clientId,
      projectId,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = query;

    const qb = this.ticketRepo
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.client', 'client')
      .leftJoinAndSelect('ticket.project', 'project');

    if (search) {
      qb.andWhere(
        '(ticket.subject LIKE :search OR ticket.description LIKE :search)',
        {
          search: `%${search}%`,
        },
      );
    }

    if (status) qb.andWhere('ticket.status = :status', { status });
    if (priority) qb.andWhere('ticket.priority = :priority', { priority });
    if (clientId) qb.andWhere('client.id = :clientId', { clientId });
    if (projectId) qb.andWhere('project.id = :projectId', { projectId });

    const [data, total] = await qb
      .orderBy(`ticket.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number): Promise<Ticket> {
    const ticket = await this.ticketRepo.findOne({
      where: { id },
      relations: ['client', 'project'],
    });
    if (!ticket) {
      throw new NotFoundException(`Ticket #${id} introuvable`);
    }
    return ticket;
  }

  async update(id: number, dto: UpdateTicketDto): Promise<Ticket> {
    const ticket = await this.findOne(id);

    if (dto.clientId) {
      const client = await this.clientRepo.findOneBy({ id: dto.clientId });
      if (!client)
        throw new NotFoundException(`Client #${dto.clientId} introuvable`);
      ticket.client = client;
    }

    if (dto.projectId) {
      const project = await this.projectRepo.findOneBy({ id: dto.projectId });
      if (!project)
        throw new NotFoundException(`Projet #${dto.projectId} introuvable`);
      ticket.project = project;
    }

    Object.assign(ticket, dto);
    return this.ticketRepo.save(ticket);
  }

  async remove(id: number): Promise<{ message: string }> {
    const ticket = await this.ticketRepo.findOneBy({ id });
    if (!ticket) {
      throw new NotFoundException(`Ticket #${id} introuvable`);
    }

    await this.ticketRepo.remove(ticket);
    return { message: `Ticket #${id} supprimé` };
  }
}
