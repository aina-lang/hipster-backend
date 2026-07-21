import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bookmark } from './entities/bookmark.entity';
import { Recipe } from './entities/recipe.entity';
import { KookComment } from './entities/kook-comment.entity';

@Injectable()
export class KookBookmarksService {
  constructor(
    @InjectRepository(Bookmark)
    private readonly repo: Repository<Bookmark>,
    @InjectRepository(Recipe)
    private readonly recipeRepo: Repository<Recipe>,
    @InjectRepository(KookComment)
    private readonly commentRepo: Repository<KookComment>,
  ) {}

  async findUserBookmarks(userId: number) {
    const bookmarks = await this.repo.find({
      where: { user: { id: userId } },
      relations: ['recipe', 'recipe.creator'],
      order: { createdAt: 'DESC' },
    });
    const ids = bookmarks.map(b => b.recipe.id).filter(Boolean);
    if (ids.length > 0) {
      const counts = await this.commentRepo
        .createQueryBuilder('c')
        .select('c.recipeId', 'recipeId')
        .addSelect('COUNT(*)', 'count')
        .where('c.recipeId IN (:...ids)', { ids })
        .groupBy('c.recipeId')
        .getRawMany<{ recipeId: number; count: number }>();
      const countMap: Record<number, number> = {};
      for (const row of counts) countMap[row.recipeId] = Number(row.count);
      for (const bm of bookmarks) (bm.recipe as any).commentsCount = countMap[bm.recipe.id] || 0;
    }
    return bookmarks;
  }

  async toggle(userId: number, recipeId: number) {
    const recipe = await this.recipeRepo.findOne({ where: { id: recipeId } });
    if (!recipe) throw new NotFoundException('Recette introuvable');

    const existing = await this.repo.findOne({
      where: { user: { id: userId }, recipe: { id: recipeId } },
    });

    if (existing) {
      await this.repo.remove(existing);
      return { bookmarked: false };
    }

    await this.repo.save(this.repo.create({
      user: { id: userId } as any,
      recipe: { id: recipeId } as any,
    }));
    return { bookmarked: true };
  }

  async isBookmarked(userId: number, recipeId: number) {
    const bookmark = await this.repo.findOne({
      where: { user: { id: userId }, recipe: { id: recipeId } },
    });
    return !!bookmark;
  }
}
