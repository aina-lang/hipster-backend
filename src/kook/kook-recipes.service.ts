import { Injectable, NotFoundException, ForbiddenException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Recipe } from './entities/recipe.entity';
import { KookUser } from './entities/kook-user.entity';
import { KookLike } from './entities/kook-like.entity';
import { KookNotificationService } from './kook-notification.service';
import { KookNotificationGateway } from './gateways/kook-notification.gateway';
import { NotificationType } from './entities/kook-notification.entity';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { UpdateRecipeDto } from './dto/update-recipe.dto';

@Injectable()
export class KookRecipesService {
  private readonly logger = new Logger(KookRecipesService.name);

  constructor(
    @InjectRepository(Recipe)
    private readonly recipeRepo: Repository<Recipe>,
    @InjectRepository(KookLike)
    private readonly likeRepo: Repository<KookLike>,
    private readonly notifService: KookNotificationService,
    private readonly notifGateway: KookNotificationGateway,
  ) {}

  async create(creator: KookUser, dto: CreateRecipeDto): Promise<Recipe> {
    this.logger.log(`[create] creator.id=${creator?.id} title="${dto?.title}"`);
    const recipe = this.recipeRepo.create({
      creator,
      title: dto.title,
      description: dto.description,
      ingredients: dto.ingredients || undefined,
      instructions: dto.instructions,
      steps: dto.steps || undefined,
      cookingTime: dto.cookingTime || 0,
      difficulty: dto.difficulty,
      imageUrl: dto.imageUrl,
    });
    this.logger.log(`[create] entity created, saving...`);
    const saved = await this.recipeRepo.save(recipe);
    this.logger.log(`[create] saved id=${saved.id}`);
    return saved;
  }

  async findAll(query: {
    page?: number;
    limit?: number;
    search?: string;
    difficulty?: string;
    categoryId?: number;
  }): Promise<{ items: Recipe[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const where: any = {};

    if (query.difficulty) where.difficulty = query.difficulty;
    if (query.categoryId) where.categoryId = query.categoryId;

    const findOptions: any = {
      where,
      relations: ['creator', 'category'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    };

    if (query.search) {
      findOptions.where = [
        { ...where, title: Like(`%${query.search}%`) },
        { ...where, description: Like(`%${query.search}%`) },
      ];
    }

    const [items, total] = await this.recipeRepo.findAndCount(findOptions);
    return { items, total };
  }

  async findOne(id: number): Promise<Recipe> {
    const recipe = await this.recipeRepo.findOne({
      where: { id },
      relations: ['creator'],
    });
    if (!recipe) throw new NotFoundException('Recette introuvable');
    return recipe;
  }

  async update(id: number, userId: number, dto: UpdateRecipeDto): Promise<Recipe> {
    const recipe = await this.recipeRepo.findOne({ where: { id }, relations: ['creator'] });
    if (!recipe) throw new NotFoundException('Recette introuvable');
    if (recipe.creator.id !== userId) throw new ForbiddenException('Vous n\'êtes pas le créateur');

    const updateData: any = { ...dto };

    Object.assign(recipe, updateData);
    return this.recipeRepo.save(recipe);
  }

  async delete(id: number, userId: number): Promise<void> {
    const recipe = await this.recipeRepo.findOne({ where: { id }, relations: ['creator'] });
    if (!recipe) throw new NotFoundException('Recette introuvable');
    if (recipe.creator.id !== userId) throw new ForbiddenException('Vous n\'êtes pas le créateur');
    await this.recipeRepo.remove(recipe);
  }

  async bulkDelete(ids: number[], userId: number): Promise<{ deleted: number }> {
    const recipes = await this.recipeRepo.find({
      where: ids.map((id) => ({ id, creator: { id: userId } })),
      relations: ['creator'],
    });
    const count = recipes.length;
    await this.recipeRepo.remove(recipes);
    return { deleted: count };
  }

  async getMyRecipes(userId: number): Promise<Recipe[]> {
    return this.recipeRepo.find({
      where: { creator: { id: userId } } as any,
      order: { createdAt: 'DESC' },
    });
  }

  async like(id: number, userId: number): Promise<Recipe> {
    const recipe = await this.recipeRepo.findOne({ where: { id }, relations: ['creator'] });
    if (!recipe) throw new NotFoundException('Recette introuvable');

    const existing = await this.likeRepo.findOne({ where: { user: { id: userId }, recipe: { id } } });
    if (existing) throw new ConflictException('Vous aimez déjà cette recette');

    await this.likeRepo.save(this.likeRepo.create({ user: { id: userId } as any, recipe: { id } as any }));

    recipe.likesCount += 1;
    const saved = await this.recipeRepo.save(recipe);

    if (recipe.creator.id !== userId) {
      const notif = await this.notifService.create({
        recipient: recipe.creator,
        type: NotificationType.LIKE,
        recipeId: recipe.id,
      }).catch((e) => this.logger.error('Erreur notification like', e.message));
      if (notif) this.notifGateway.sendNotification(recipe.creator.id, notif);
    }

    return saved;
  }

  async unlike(id: number, userId: number): Promise<Recipe> {
    const recipe = await this.recipeRepo.findOne({ where: { id } });
    if (!recipe) throw new NotFoundException('Recette introuvable');

    const existing = await this.likeRepo.findOne({ where: { user: { id: userId }, recipe: { id } } });
    if (!existing) throw new NotFoundException('Vous n\'avez pas aimé cette recette');

    await this.likeRepo.remove(existing);

    recipe.likesCount = Math.max(0, recipe.likesCount - 1);
    return this.recipeRepo.save(recipe);
  }
}
