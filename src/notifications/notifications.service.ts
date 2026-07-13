import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { Notification } from './entities/notification.entity';
import { User } from 'src/users/entities/user.entity';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { PaginatedResult } from 'src/common/types/paginated-result.type';

import { NotificationsGateway } from './notifications.gateway';
import { Role } from 'src/common/enums/role.enum';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(ClientProfile)
    private readonly clientRepo: Repository<ClientProfile>,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  async create(dto: CreateNotificationDto): Promise<Notification> {
    const user = await this.userRepo.findOneBy({ id: dto.userId });
    if (!user) {
      throw new NotFoundException(`Utilisateur #${dto.userId} introuvable`);
    }

    const notification = this.notificationRepo.create({
      title: dto.title,
      message: dto.message,
      isRead: dto.isRead ?? false,
      user,
    });

    return this.notificationRepo.save(notification);
  }

  /**
   * 🔔 Notification générique (type + data + actionUrl) + push temps réel.
   * Utilisée par le module Partners. Ne lève pas si l'utilisateur est introuvable.
   */
  async notifyUser(params: {
    userId: number;
    title: string;
    message: string;
    type?: string;
    data?: any;
    actionUrl?: string;
  }): Promise<Notification | null> {
    const user = await this.userRepo.findOneBy({ id: params.userId });
    if (!user) return null;

    const notification = this.notificationRepo.create({
      user,
      title: params.title,
      message: params.message,
      type: params.type,
      data: params.data,
      actionUrl: params.actionUrl,
    });

    const saved = await this.notificationRepo.save(notification);
    this.notificationsGateway.emitToUser(params.userId, 'notification:new', saved);
    return saved;
  }


  async findPaginated(
    query: QueryNotificationsDto,
  ): Promise<PaginatedResult<Notification>> {
    const {
      page = 1,
      limit = 25,
      search,
      userId,
      isRead,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = query;

    const qb = this.notificationRepo
      .createQueryBuilder('notification')
      .leftJoinAndSelect('notification.user', 'user');

    if (search) {
      qb.andWhere(
        '(notification.title LIKE :search OR notification.message LIKE :search)',
        {
          search: `%${search}%`,
        },
      );
    }

    if (typeof isRead === 'boolean') {
      qb.andWhere('notification.isRead = :isRead', { isRead });
    }

    if (userId) {
      qb.andWhere('user.id = :userId', { userId });
    }

    const [data, total] = await qb
      .orderBy(`notification.${sortBy}`, sortOrder)
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

  async findOne(id: number): Promise<Notification> {
    const notification = await this.notificationRepo.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!notification) {
      throw new NotFoundException(`Notification #${id} introuvable`);
    }

    return notification;
  }

  async update(id: number, dto: UpdateNotificationDto): Promise<Notification> {
    const notification = await this.findOne(id);
    const { userId, ...rest } = dto;

    if (userId) {
      const user = await this.userRepo.findOneBy({ id: userId });
      if (!user)
        throw new NotFoundException(`Utilisateur #${userId} introuvable`);
      notification.user = user;
    }

    Object.assign(notification, rest);
    return this.notificationRepo.save(notification);
  }

  async remove(id: number): Promise<{ message: string }> {
    const notification = await this.notificationRepo.findOneBy({ id });
    if (!notification) {
      throw new NotFoundException(`Notification #${id} introuvable`);
    }

    await this.notificationRepo.remove(notification);

    return { message: `Notification #${id} supprimée` };
  }

  // 🔹 DELETE MULTIPLE
  async removeMany(ids: number[]): Promise<{ deleted: number; notFound: number[] }> {
    const notifications = await this.notificationRepo.find({
      where: { id: In(ids) },
    });
    const foundIds = notifications.map((n) => n.id);
    const notFound = ids.filter((id) => !foundIds.includes(id));
    if (notifications.length) await this.notificationRepo.remove(notifications);
    return { deleted: notifications.length, notFound };
  }

  /**
   * Marquer toutes les notifications d'un utilisateur comme lues
   */
  async markAllAsRead(userId: number): Promise<{ count: number }> {
    const result = await this.notificationRepo
      .createQueryBuilder()
      .update(Notification)
      .set({ isRead: true })
      .where('userId = :userId', { userId })
      .andWhere('isRead = :isRead', { isRead: false })
      .execute();

    // Emit real-time event
    this.notificationsGateway.emitToUser(userId, 'notifications:allRead', {
      count: result.affected || 0,
    });

    return { count: result.affected || 0 };
  }

  /**
   * Créer une notification pour la soumission d'un projet par un client
   */
  async createProjectSubmissionNotification(
    projectId: number,
    projectName: string,
    clientId: number,
    adminIds: number[],
  ): Promise<Notification[]> {
    const notifications: Notification[] = [];

    // Récupérer le client
    const client = await this.clientRepo.findOne({
      where: { id: clientId },
      relations: ['user'],
    });

    if (!client || !client.user) {
      throw new NotFoundException('Client not found');
    }

    // Créer une notification pour chaque admin
    for (const adminId of adminIds) {
      const admin = await this.userRepo.findOneBy({ id: adminId });
      if (!admin) continue;

      const notification = this.notificationRepo.create({
        user: admin,
        type: 'project_submission',
        title: '📋 Nouveau projet soumis',
        message: `${client.user.firstName} ${client.user.lastName} a soumis un nouveau projet: "${projectName}"`,
        data: {
          projectId,
          projectName,
          clientId,
          clientName: `${client.user.firstName} ${client.user.lastName}`,
        },
      });

      const saved = await this.notificationRepo.save(notification);
      notifications.push(saved);

      // Emit real-time notification
      this.notificationsGateway.emitToUser(adminId, 'notification:new', saved);
    }

    return notifications;
  }

  /**
   * Créer une notification pour la création d'un ticket par un client
   */
  async createTicketNotification(
    ticketId: number,
    ticketTitle: string,
    clientId: number,
    adminIds: number[],
  ): Promise<Notification[]> {
    const notifications: Notification[] = [];

    // Récupérer le client
    const client = await this.clientRepo.findOne({
      where: { id: clientId },
      relations: ['user'],
    });

    if (!client || !client.user) {
      throw new NotFoundException('Client not found');
    }

    // Créer une notification pour chaque admin
    for (const adminId of adminIds) {
      const admin = await this.userRepo.findOneBy({ id: adminId });
      if (!admin) continue;

      const notification = this.notificationRepo.create({
        user: admin,
        type: 'ticket_creation',
        title: '🎫 Nouveau ticket créé',
        message: `${client.user.firstName} ${client.user.lastName} a créé un nouveau ticket: "${ticketTitle}"`,
        data: {
          ticketId,
          ticketTitle,
          clientId,
          clientName: `${client.user.firstName} ${client.user.lastName}`,
        },
      });

      const saved = await this.notificationRepo.save(notification);
      notifications.push(saved);

      // Emit real-time notification
      this.notificationsGateway.emitToUser(adminId, 'notification:new', saved);
    }

    return notifications;
  }

  /**
   * Notifier les membres assignés à un projet
   */
  async notifyProjectMembers(
    projectId: number,
    projectName: string,
    memberIds: number[],
    message: string,
  ): Promise<Notification[]> {
    const notifications: Notification[] = [];

    for (const memberId of memberIds) {
      const member = await this.userRepo.findOneBy({ id: memberId });
      if (!member) continue;

      // 🚫 Ne pas notifier les clients pour une assignation interne
      if (member.roles.includes(Role.CLIENT_MARKETING)) {
        continue;
      }

      const notification = this.notificationRepo.create({
        user: member,
        type: 'project_assignment',
        title: '👥 Assignation à un projet',
        message: `${message}: "${projectName}"`,
        data: {
          projectId,
          projectName,
        },
      });

      const saved = await this.notificationRepo.save(notification);
      notifications.push(saved);

      // Emit real-time notification
      this.notificationsGateway.emitToUser(memberId, 'notification:new', saved);
    }

    return notifications;
  }

  /**
   * Notifier le client qu'un projet a été créé pour lui
   */
  async sendProjectCreatedNotification(
    userId: number,
    projectId: number,
    projectName: string,
  ): Promise<Notification> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('User not found');

    const notification = this.notificationRepo.create({
      user,
      type: 'project_created',
      title: '🏗️ Nouveau projet créé',
      message: `Un nouveau projet \"${projectName}\" a été créé pour vous.`,
      data: { projectId, projectName },
    });

    const saved = await this.notificationRepo.save(notification);
    this.notificationsGateway.emitToUser(userId, 'notification:new', saved);
    return saved;
  }

  // Notifier le client qu'une facture ou un devis a été créé
  async createInvoiceNotification(
    invoiceId: number,
    reference: string,
    type: string,
    userId: number,
  ): Promise<Notification | null> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) return null;

    const typeLabel = type === 'quote' ? 'devis' : 'facture';
    const icon = type === 'quote' ? '📄' : '💰';

    const notification = this.notificationRepo.create({
      user,
      type: type === 'quote' ? 'quote_created' : 'invoice_created',
      title: `${icon} Nouveau ${typeLabel} disponible`,
      message: `Votre ${typeLabel} ${reference} est disponible sur votre espace client.`,
      data: { invoiceId, reference, type },
    });

    const saved = await this.notificationRepo.save(notification);
    this.notificationsGateway.emitToUser(userId, 'notification:new', saved);
    return saved;
  }

  // Notifier le client qu'un ticket a été ouvert pour lui (via Backoffice)
  async createTicketNotificationForClient(
    ticketId: number,
    ticketTitle: string,
    userId: number,
  ): Promise<Notification | null> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) return null;

    const notification = this.notificationRepo.create({
      user,
      type: 'ticket_update',
      title: '🎫 Nouveau ticket support',
      message: `Un nouveau ticket support a été ouvert pour vous: \"${ticketTitle}\".`,
      data: { ticketId, ticketTitle },
    });

    const saved = await this.notificationRepo.save(notification);
    this.notificationsGateway.emitToUser(userId, 'notification:new', saved);
    return saved;
  }

  /**
   * Notifier le client qu'un projet a été refusé avec le motif
   */
  async createProjectRefusalNotification(
    userId: number,
    projectId: number,
    projectName: string,
    reason: string,
  ): Promise<Notification> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('User not found');

    const notification = this.notificationRepo.create({
      user,
      type: 'project_refused',
      title: '❌ Projet refusé',
      message: `Votre projet "${projectName}" a été refusé. Motif: ${reason}`,
      data: { projectId, projectName, reason },
    });

    const saved = await this.notificationRepo.save(notification);
    this.notificationsGateway.emitToUser(userId, 'notification:new', saved);
    return saved;
  }

  /**
   * Notifier le client qu'un ticket a été refusé avec le motif
   */
  async createTicketRefusalNotification(
    userId: number,
    ticketId: number,
    ticketTitle: string,
    reason: string,
  ): Promise<Notification> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('User not found');

    const notification = this.notificationRepo.create({
      user,
      type: 'ticket_rejected',
      title: '❌ Ticket refusé',
      message: `Votre ticket "${ticketTitle}" a été refusé. Motif: ${reason}`,
      data: { ticketId, ticketTitle, reason },
    });

    const saved = await this.notificationRepo.save(notification);
    this.notificationsGateway.emitToUser(userId, 'notification:new', saved);
    return saved;
  }

  /**
   * Notifier le client qu'un projet a été annulé
   */
  async createProjectCancellationNotification(
    userId: number,
    projectId: number,
    projectName: string,
  ): Promise<Notification> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('User not found');

    const notification = this.notificationRepo.create({
      user,
      type: 'project_canceled',
      title: '🚫 Projet annulé',
      message: `Votre projet "${projectName}" a été annulé.`,
      data: { projectId, projectName },
    });

    const saved = await this.notificationRepo.save(notification);
    this.notificationsGateway.emitToUser(userId, 'notification:new', saved);
    return saved;
  }
}
