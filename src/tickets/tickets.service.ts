import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
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
import { TasksService } from 'src/tasks/tasks.service';
import { ValidateTicketDto } from './dto/validate-ticket.dto';
import { TicketStatus } from './entities/ticket.entity';

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
    private readonly tasksService: TasksService,
  ) {}

  async validateTicket(
    id: number,
    dto: ValidateTicketDto,
    adminId: number,
  ): Promise<Ticket> {
    const ticket = await this.findOne(id);

    if (dto.status === TicketStatus.ACCEPTED) {
      if (!ticket.project) {
        throw new BadRequestException(
          'Le ticket doit être lié à un projet pour être accepté.',
        );
      }

      // 1. Créer la tâche
      const task = await this.tasksService.create(
        {
          title: `[TICKET #${ticket.id}] ${ticket.subject}`,
          description: ticket.description,
          projectId: ticket.project.id,
          assigneeIds: dto.assigneeIds,
          priority: ticket.priority as any,
        },
        adminId,
      );

      // 2. Lier le ticket à la tâche
      ticket.task = task;
      ticket.status = TicketStatus.ACCEPTED;
    } else if (dto.status === TicketStatus.REJECTED) {
      ticket.status = TicketStatus.REJECTED;
    }

    const savedTicket = await this.ticketRepo.save(ticket);

    // 📩 Notification & Emails
    try {
      // 1. Fetch relations for notification data
      const t = await this.ticketRepo.findOne({
        where: { id: savedTicket.id },
        relations: [
          'client',
          'client.user',
          'project',
          'task',
          'task.assignees',
          'task.assignees.user',
        ],
      });

      if (!t) return savedTicket;

      // 2. Notify Client (Accepted / Rejected)
      if (t.client?.user) {
        const title =
          dto.status === TicketStatus.ACCEPTED
            ? '✅ Ticket Accepté'
            : '❌ Ticket Refusé';
        const message =
          dto.status === TicketStatus.ACCEPTED
            ? `Votre ticket "${t.subject}" a été accepté et converti en tâche.`
            : `Votre ticket "${t.subject}" a été refusé par l'équipe technique.`;

        // Push
        await this.notificationsService.create({
          userId: t.client.user.id,
          title,
          message,
          type: 'ticket_status_update',
          data: { ticketId: t.id, status: t.status },
        });

        // Email
        if (t.client.user.email) {
          if (dto.status === TicketStatus.ACCEPTED) {
            await this.mailService.sendTicketAcceptedEmail(
              t.client.user.email,
              {
                clientName: `${t.client.user.firstName} ${t.client.user.lastName}`,
                ticketTitle: t.subject,
                projectName: t.project?.name,
              },
              t.client.user.roles,
            );
          } else {
            await this.mailService.sendTicketRejectedEmail(
              t.client.user.email,
              {
                clientName: `${t.client.user.firstName} ${t.client.user.lastName}`,
                ticketTitle: t.subject,
              },
              t.client.user.roles,
            );
          }
        }
      }

      // 3. Notify Employees (Task Assigned)
      if (dto.status === TicketStatus.ACCEPTED && t.task?.assignees) {
        for (const employeeProfile of t.task.assignees) {
          const employeeUser = employeeProfile.user;
          if (!employeeUser) continue;

          // Push
          await this.notificationsService.create({
            userId: employeeUser.id,
            title: '📋 Nouvelle tâche (Ticket)',
            message: `Une nouvelle tâche a été créée pour vous à partir du ticket #${t.id}: "${t.subject}"`,
            type: 'task_assigned',
            data: { taskId: t.task.id, ticketId: t.id },
          });

          // Email
          if (employeeUser.email) {
            await this.mailService.sendTaskAssignedEmail(
              employeeUser.email,
              {
                assigneeName: `${employeeUser.firstName} ${employeeUser.lastName}`,
                taskTitle: t.task.title,
                projectName: t.project?.name,
                taskPriority: t.task.priority,
                taskDescription: t.task.description,
                clientName: `${t.client.user.firstName} ${t.client.user.lastName}`,
              },
              employeeUser.roles,
            );
          }
        }
      }
    } catch (e) {
      console.error('Failed to send ticket validation notifications:', e);
    }

    return savedTicket;
  }

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
        // 1. Notify Admins
        const admins = await this.userRepo.find({
          where: { roles: In(['admin']) },
        });
        const adminIds = admins.map((a) => a.id);

        await this.notificationsService.createTicketNotification(
          savedTicket.id,
          savedTicket.subject,
          client.id,
          adminIds,
        );

        for (const admin of admins) {
          if (admin.email) {
            await this.mailService.sendTicketCreationEmail(admin.email, {
              adminName: `${admin.firstName} ${admin.lastName}`,
              ticketTitle: savedTicket.subject,
              clientName: `${clientWithUser.user.firstName} ${clientWithUser.user.lastName}`,
              ticketDescription: savedTicket.description,
              priority: savedTicket.priority,
            });
          }
        }

        // 2. Notify Client (especially if created via Backoffice)
        await this.notificationsService.createTicketNotificationForClient(
          savedTicket.id,
          savedTicket.subject,
          clientWithUser.user.id,
        );

        // (Optional) Send email to client too
        if (clientWithUser.user.email) {
          await this.mailService.sendTicketCreationEmail(
            clientWithUser.user.email,
            {
              adminName: `${clientWithUser.user.firstName} ${clientWithUser.user.lastName}`, // Using client name as placeholder or custom template
              ticketTitle: savedTicket.subject,
              clientName: 'Support Hipster',
              ticketDescription: savedTicket.description,
              priority: savedTicket.priority,
            },
          );
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
      .leftJoinAndSelect('client.user', 'clientUser')
      .leftJoinAndSelect('ticket.project', 'project')
      .leftJoinAndSelect('project.members', 'members')
      .leftJoinAndSelect('members.employee', 'employee');

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
