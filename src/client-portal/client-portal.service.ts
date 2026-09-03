import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Project } from 'src/projects/entities/project.entity';
import { Task } from 'src/tasks/entities/task.entity';
import { Ticket } from 'src/tickets/entities/ticket.entity';
import { Invoice } from 'src/invoices/entities/invoice.entity';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { ClientWebsite } from 'src/profiles/entities/client-website.entity';
import { User } from 'src/users/entities/user.entity';
import { CreateClientTicketDto } from './dto/create-client-ticket.dto';
import { RequestCategory } from 'src/common/enums/request-category.enum';
import { TicketStatus, TicketPriority } from 'src/tickets/entities/ticket.entity';
import { InvoiceStatus, InvoiceType } from 'src/invoices/entities/invoice.entity';
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
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    @InjectRepository(ClientWebsite)
    private readonly websiteRepo: Repository<ClientWebsite>,
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

    // Tous les sites rattachés au client (pas seulement ceux liés à un projet)
    const websites = await this.websiteRepo.find({
      where: { clientId: client.id },
      order: { url: 'ASC' },
    });

    // Sites suivis dans le projet global de maintenance → indicateur pour le client
    const tasks = await this.taskRepo.find({
      where: {
        website: { clientId: client.id },
        project: { name: Like('Maintenance Sites Web%') },
      },
      select: ['id', 'websiteId'],
    });
    const inMaintenance = new Set(
      tasks.map((t) => t.websiteId).filter((id): id is number => !!id),
    );

    return websites.map((website) => ({
      id: website.id,
      url: website.url,
      adminLogin: website.adminLogin,
      plainPassword: website.plainPassword,
      adminPassword: website.adminPassword,
      description: website.description ?? null,
      inMaintenance: inMaintenance.has(website.id),
      lastMaintenanceDate: website.lastMaintenanceDate ?? null,
    }));
  }

  /**
   * Suivi de maintenance du client connecté.
   * Ne renvoie que les sites appartenant à SON profil client, et jamais les
   * tarifs ni les accès admin (déjà exposés par `getWebsites`).
   */
  async getMaintenanceSites(userId: number) {
    const client = await this.findClient(userId);

    const tasks = await this.taskRepo.find({
      where: {
        website: { clientId: client.id },
        project: { name: Like('Maintenance Sites Web%') },
      },
      relations: ['website'],
      order: { createdAt: 'DESC' },
    });

    return tasks
      .filter((task) => task.website)
      .map((task) => ({
        id: task.website!.id,
        url: task.website!.url,
        description: task.website!.description ?? null,
        lastMaintenanceDate: task.website!.lastMaintenanceDate ?? null,
        nextMaintenanceDate: task.dueDate ?? task.nextRunAt ?? null,
        recurrenceType: task.recurrenceType ?? null,
        recurrenceInterval: task.recurrenceInterval ?? null,
        recurrenceDays: task.recurrenceDays ?? null,
      }));
  }

  async getInvoiceStats(userId: number) {
    const client = await this.findClient(userId);

    const result = await this.invoiceRepo
      .createQueryBuilder('invoice')
      .where('invoice.client.id = :clientId', { clientId: client.id })
      .select('SUM(CASE WHEN invoice.status = :paid AND invoice.type = :invoice THEN invoice.amount ELSE 0 END)', 'totalPaid')
      .addSelect('SUM(CASE WHEN invoice.status = :pending AND invoice.type = :invoice THEN invoice.amount ELSE 0 END)', 'totalPending')
      .addSelect('SUM(CASE WHEN invoice.type = :quote THEN invoice.amount ELSE 0 END)', 'totalQuotes')
      .setParameters({
        paid: InvoiceStatus.PAID,
        pending: InvoiceStatus.PENDING,
        invoice: InvoiceType.INVOICE,
        quote: InvoiceType.QUOTE,
      })
      .getRawOne();

    const totalPaid = parseFloat(result?.totalPaid) || 0;
    const totalPending = parseFloat(result?.totalPending) || 0;
    const totalQuotes = parseFloat(result?.totalQuotes) || 0;

    return {
      totalPaid: Math.round(totalPaid * 100) / 100,
      totalPending: Math.round(totalPending * 100) / 100,
      totalQuotes: Math.round(totalQuotes * 100) / 100,
      totalInvoices: totalPaid + totalPending,
    };
  }
}
