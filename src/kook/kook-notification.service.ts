import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KookNotification, NotificationType } from './entities/kook-notification.entity';
import { KookUser } from './entities/kook-user.entity';

@Injectable()
export class KookNotificationService {
  constructor(
    @InjectRepository(KookNotification)
    private readonly notifRepo: Repository<KookNotification>,
  ) {}

  async create(data: {
    recipient: KookUser;
    actor?: KookUser;
    type: NotificationType;
    message?: string;
    recipeId?: number;
    commentId?: number;
  }) {
    const notif = this.notifRepo.create(data);
    return this.notifRepo.save(notif);
  }

  async findByUser(userId: number, page = 1, limit = 20) {
    const [items, total] = await this.notifRepo.findAndCount({
      where: { recipient: { id: userId } },
      relations: ['actor'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async getUnreadCount(userId: number) {
    return this.notifRepo.count({
      where: { recipient: { id: userId }, isRead: false },
    });
  }

  async markAsRead(notifId: number, userId: number) {
    await this.notifRepo.update(
      { id: notifId, recipient: { id: userId } },
      { isRead: true },
    );
    return { message: 'Notification marquée comme lue' };
  }

  async markAllAsRead(userId: number) {
    await this.notifRepo.update(
      { recipient: { id: userId }, isRead: false },
      { isRead: true },
    );
    return { message: 'Toutes les notifications marquées comme lues' };
  }

  async delete(notifId: number, userId: number) {
    await this.notifRepo.delete({ id: notifId, recipient: { id: userId } });
    return { message: 'Notification supprimée' };
  }
}
