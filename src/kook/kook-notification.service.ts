import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KookNotification, NotificationType } from './entities/kook-notification.entity';
import { KookUser } from './entities/kook-user.entity';
import { Recipe } from './entities/recipe.entity';
import { KookComment } from './entities/kook-comment.entity';

@Injectable()
export class KookNotificationService {
  constructor(
    @InjectRepository(KookNotification)
    private readonly notifRepo: Repository<KookNotification>,
    @InjectRepository(Recipe)
    private readonly recipeRepo: Repository<Recipe>,
    @InjectRepository(KookComment)
    private readonly commentRepo: Repository<KookComment>,
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
    const saved = await this.notifRepo.save(notif);
    saved.actor = data.actor;
    return this.toDto(saved);
  }

  async findByUser(userId: number, page = 1, limit = 20) {
    const [items, total] = await this.notifRepo.findAndCount({
      where: { recipient: { id: userId } },
      relations: ['actor'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const shaped = await Promise.all(items.map((n) => this.toDto(n)));
    return { items: shaped, total, page, limit };
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

  async deleteAll(userId: number) {
    await this.notifRepo.delete({ recipient: { id: userId } });
    return { message: 'Toutes les notifications supprimées' };
  }

  // Reshapes the entity into the flat structure the mobile app actually reads
  // (actorName/actorAvatar/read/recipeTitle/commentText), instead of the raw
  // entity (nested actor relation, isRead) it was previously sent.
  private async toDto(n: KookNotification) {
    let recipeTitle: string | undefined;
    let commentText: string | undefined;

    if (n.recipeId) {
      const recipe = await this.recipeRepo.findOne({ where: { id: n.recipeId }, select: ['id', 'title'] });
      recipeTitle = recipe?.title;
    }
    if (n.commentId) {
      const comment = await this.commentRepo.findOne({ where: { id: n.commentId }, select: ['id', 'text'] });
      commentText = comment?.text;
    }

    return {
      id: n.id,
      type: n.type,
      message: n.message,
      recipeId: n.recipeId,
      commentId: n.commentId,
      actorName: n.actor?.pseudo || n.actor?.firstName,
      actorAvatar: n.actor?.avatarUrl,
      recipeTitle,
      commentText,
      read: n.isRead,
      createdAt: n.createdAt,
    };
  }
}
