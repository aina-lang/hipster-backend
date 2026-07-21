import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bookmark } from './entities/bookmark.entity';
import { Recipe } from './entities/recipe.entity';

@Injectable()
export class KookBookmarksService {
  constructor(
    @InjectRepository(Bookmark)
    private readonly repo: Repository<Bookmark>,
    @InjectRepository(Recipe)
    private readonly recipeRepo: Repository<Recipe>,
  ) {}

  async findUserBookmarks(userId: number) {
    return this.repo.find({
      where: { user: { id: userId } },
      relations: ['recipe', 'recipe.creator'],
      order: { createdAt: 'DESC' },
    });
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
