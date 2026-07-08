import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from 'src/projects/entities/project.entity';
import { Ticket } from 'src/tickets/entities/ticket.entity';
import { Invoice } from 'src/invoices/entities/invoice.entity';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { User } from 'src/users/entities/user.entity';
import { CreateClientTicketDto } from './dto/create-client-ticket.dto';
import { RequestCategory } from 'src/common/enums/request-category.enum';
import { TicketStatus, TicketPriority } from 'src/tickets/entities/ticket.entity';
import { NotificationsService } from 'src/notifications/notifications.service';

@Injectable()
export class ClientPortalService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(ClientProfile)
    private readonly clientProfileRepo: Repository<ClientProfile>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async findClient(userId: number): Promise<ClientProfile> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['clientProfile'],
    });
    console.log(`[findClient] userId=${userId}, user=${!!user}, profile=${!!user?.clientProfile}`);
    if (!user?.clientProfile) {
      throw new NotFoundException('Profil client introuvable');
    }
    return user.clientProfile;
  }

  async getDashboard(userId: number) {
    const client = await this.findClient(userId);

    const projects = await this.projectRepo.find({
      where: { client: { id: client.id } },
      relations: ['client'],
    });

    const tickets = await this.ticketRepo.find({
      where: { client: { id: client.id } },
      relations: ['project'],
      order: { createdAt: 'DESC' },
      take: 5,
    });

    const invoices = await this.invoiceRepo.find({
      where: { client: { id: client.id } },
      order: { createdAt: 'DESC' },
      take: 5,
    });

    const totalTickets = await this.ticketRepo.count({
      where: { client: { id: client.id } },
    });

    const openTickets = await this.ticketRepo.count({
      where: { client: { id: client.id }, status: TicketStatus.OPEN },
    });

    const activeProjects = projects.filter(
      p => p.status !== 'canceled' && p.status !== 'refused' && p.status !== 'completed',
    );

    return {
      projects: {
        total: projects.length,
        active: activeProjects.length,
        list: projects,
      },
      tickets: {
        total: totalTickets,
        open: openTickets,
        recent: tickets,
      },
      invoices: {
        recent: invoices,
      },
    };
  }

  async getProjects(userId: number) {
    const client = await this.findClient(userId);
    return this.projectRepo.find({
      where: { client: { id: client.id } },
      relations: ['client'],
      order: { updatedAt: 'DESC' },
    });
  }

  async getProject(userId: number, projectId: number) {
    const client = await this.findClient(userId);
    const project = await this.projectRepo.findOne({
      where: { id: projectId, client: { id: client.id } },
      relations: ['client', 'tickets'],
    });

    if (!project) {
      throw new NotFoundException('Projet introuvable');
    }

    return project;
  }

  async getTickets(userId: number, query?: { page?: number; limit?: number; status?: string }) {
    const client = await this.findClient(userId);
    const page = query?.page || 1;
    const limit = query?.limit || 25;
    const skip = (page - 1) * limit;

    const where: any = { client: { id: client.id } };
    if (query?.status) {
      where.status = query.status;
    }

    const [data, total] = await this.ticketRepo.findAndCount({
      where,
      relations: ['project', 'files'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async createTicket(userId: number, dto: CreateClientTicketDto) {
    const client = await this.findClient(userId);

    let project: Project | null = null;

    if (dto.projectId) {
      project = await this.projectRepo.findOne({
        where: { id: dto.projectId, client: { id: client.id } },
        relations: ['client'],
      });

      if (!project) {
        throw new NotFoundException('Projet introuvable');
      }

      if (dto.category === RequestCategory.MODIFICATION) {
        if (project.modifications_restantes != null && project.modifications_restantes <= 0) {
          throw new BadRequestException(
            "Vous avez épuisé vos 3 modifications incluses. Veuillez contacter le support pour une nouvelle demande d'évolution.",
          );
        }
      }

      if (dto.category === RequestCategory.ANOMALY && !project.maintenance_active) {
        throw new BadRequestException(
          'Votre contrat de maintenance est inactif. Veuillez contacter le support pour signaler cette anomalie.',
        );
      }
    }

    const ticket = this.ticketRepo.create({
      subject: dto.subject,
      description: dto.description,
      category: dto.category,
      priority: dto.priority || TicketPriority.MEDIUM,
      status: TicketStatus.OPEN,
      client,
      project: project || undefined,
    });

    const saved = await this.ticketRepo.save(ticket);

    try {
      await this.notificationsService.create({
        userId: userId,
        title: 'Demande envoyée',
        message: `Votre demande "${dto.subject}" a été reçue et est en cours de traitement.`,
      });
    } catch {}

    return saved;
  }

  async getInvoices(userId: number) {
    const client = await this.findClient(userId);
    return this.invoiceRepo.find({
      where: { client: { id: client.id } },
      relations: ['project'],
      order: { createdAt: 'DESC' },
    });
  }

  async getWebsites(userId: number) {
    const client = await this.findClient(userId);
    const projects = await this.projectRepo.find({
      where: { client: { id: client.id } },
      relations: ['websites'],
    });

    return projects.map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      websites: p.websites || [],
    }));
  }
}
