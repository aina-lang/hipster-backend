import { Injectable, NotFoundException, ForbiddenException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KookComment } from './entities/kook-comment.entity';
import { KookCommentLike } from './entities/kook-comment-like.entity';
import { KookUser } from './entities/kook-user.entity';
import { Recipe } from './entities/recipe.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { KookNotificationService } from './kook-notification.service';
import { KookNotificationGateway } from './gateways/kook-notification.gateway';
import { NotificationType } from './entities/kook-notification.entity';

@Injectable()
export class KookCommentService {
  private readonly logger = new Logger(KookCommentService.name);

  constructor(
    @InjectRepository(KookComment)
    private readonly commentRepo: Repository<KookComment>,
    @InjectRepository(KookCommentLike)
    private readonly commentLikeRepo: Repository<KookCommentLike>,
    @InjectRepository(Recipe)
    private readonly recipeRepo: Repository<Recipe>,
    private readonly notifService: KookNotificationService,
    private readonly notifGateway: KookNotificationGateway,
  ) {}

  async create(author: KookUser, recipeId: number, dto: CreateCommentDto) {
    const recipe = await this.recipeRepo.findOne({ where: { id: recipeId }, relations: ['creator'] });
    if (!recipe) throw new NotFoundException('Recette introuvable');

    let parent: KookComment | null = null;
    if (dto.parentId) {
      parent = await this.commentRepo.findOne({ where: { id: dto.parentId }, relations: ['author'] });
      if (!parent) throw new NotFoundException('Commentaire parent introuvable');
    }

    const comment = this.commentRepo.create({
      author,
      recipe: { id: recipeId } as any,
      text: dto.text,
      parent: parent || undefined,
    });
    await this.commentRepo.save(comment);

    recipe.commentsCount += 1;
    await this.recipeRepo.save(recipe);

    const fullComment = await this.commentRepo.findOne({
      where: { id: comment.id },
      relations: ['author', 'parent'],
    });
    this.notifGateway.broadcastCommentCreated(recipeId, fullComment);

    if (parent) {
      if (parent.author.id !== author.id) {
        const notif = await this.notifService.create({
          recipient: parent.author,
          actor: author,
          type: NotificationType.REPLY,
          recipeId,
          commentId: comment.id,
        }).catch((e) => this.logger.error('Erreur notification reply', e.message));
        if (notif) this.notifGateway.sendNotification(parent.author.id, notif);
      }
    } else if (recipe.creator.id !== author.id) {
      const notif = await this.notifService.create({
        recipient: recipe.creator,
        actor: author,
        type: NotificationType.COMMENT,
        recipeId,
        commentId: comment.id,
      }).catch((e) => this.logger.error('Erreur notification comment', e.message));
      if (notif) this.notifGateway.sendNotification(recipe.creator.id, notif);
    }

    return fullComment;
  }

  async getUserLikes(recipeId: number, userId: number): Promise<number[]> {
    const likes = await this.commentLikeRepo
      .createQueryBuilder('cl')
      .innerJoinAndSelect('cl.comment', 'c')
      .where('cl.userId = :userId', { userId })
      .andWhere('c.recipeId = :recipeId', { recipeId })
      .getMany();
    return likes.map(l => l.comment.id);
  }

  async findByRecipe(recipeId: number) {
    return this.commentRepo.find({
      where: { recipe: { id: recipeId } },
      relations: ['author', 'parent', 'parent.author'],
      order: { createdAt: 'DESC' },
    });
  }

  async delete(commentId: number, recipeId: number, userId: number) {
    const comment = await this.commentRepo.findOne({
      where: { id: commentId },
      relations: ['author'],
    });
    if (!comment) throw new NotFoundException('Commentaire introuvable');
    if (comment.author.id !== userId) throw new ForbiddenException('Vous n\'êtes pas l\'auteur');

    await this.commentRepo.remove(comment);

    const recipe = await this.recipeRepo.findOne({ where: { id: recipeId } });
    if (recipe) {
      recipe.commentsCount = Math.max(0, recipe.commentsCount - 1);
      await this.recipeRepo.save(recipe);
    }
    this.notifGateway.broadcastCommentDeleted(recipeId, commentId);

    return { message: 'Commentaire supprimé' };
  }

  async like(commentId: number, userId: number) {
    const comment = await this.commentRepo.findOne({ where: { id: commentId }, relations: ['recipe'] });
    if (!comment) throw new NotFoundException('Commentaire introuvable');

    const existing = await this.commentLikeRepo.findOne({
      where: { user: { id: userId }, comment: { id: commentId } },
    });
    if (existing) return comment;

    await this.commentLikeRepo.save(this.commentLikeRepo.create({
      user: { id: userId } as any,
      comment: { id: commentId } as any,
    }));

    comment.likesCount += 1;
    const saved = await this.commentRepo.save(comment);
    this.notifGateway.broadcastCommentLiked(comment.recipe.id, commentId, saved.likesCount, userId, true);
    return saved;
  }

  async unlike(commentId: number, userId: number) {
    const comment = await this.commentRepo.findOne({ where: { id: commentId }, relations: ['recipe'] });
    if (!comment) throw new NotFoundException('Commentaire introuvable');

    const existing = await this.commentLikeRepo.findOne({
      where: { user: { id: userId }, comment: { id: commentId } },
    });
    if (!existing) return comment;

    await this.commentLikeRepo.remove(existing);
    comment.likesCount = Math.max(0, comment.likesCount - 1);
    const saved = await this.commentRepo.save(comment);
    this.notifGateway.broadcastCommentLiked(comment.recipe.id, commentId, saved.likesCount, userId, false);
    return saved;
  }
}
