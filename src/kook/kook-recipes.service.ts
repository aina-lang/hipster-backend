import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Recipe } from './entities/recipe.entity';
import { KookUser } from './entities/kook-user.entity';
import { CreateRecipeDto } from './dto/create-recipe.dto';
import { UpdateRecipeDto } from './dto/update-recipe.dto';

@Injectable()
export class KookRecipesService {
  private readonly logger = new Logger(KookRecipesService.name);

  constructor(
    @InjectRepository(Recipe)
    private readonly recipeRepo: Repository<Recipe>,
  ) {}

  async create(creator: KookUser, dto: CreateRecipeDto): Promise<Recipe> {
    const recipe = this.recipeRepo.create({
      creator,
      title: dto.title,
      description: dto.description,
      ingredients: dto.ingredients ? JSON.stringify(dto.ingredients) : undefined,
      instructions: dto.instructions,
      cookingTime: dto.cookingTime || 0,
      difficulty: dto.difficulty,
      imageUrl: dto.imageUrl,
    });
    return this.recipeRepo.save(recipe);
  }

  async findAll(query: {
    page?: number;
    limit?: number;
    search?: string;
    difficulty?: string;
  }): Promise<{ items: Recipe[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const where: any = {};

    if (query.difficulty) where.difficulty = query.difficulty;

    const findOptions: any = {
      where,
      relations: ['creator'],
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
    if (dto.ingredients) updateData.ingredients = JSON.stringify(dto.ingredients);

    Object.assign(recipe, updateData);
    return this.recipeRepo.save(recipe);
  }

  async delete(id: number, userId: number): Promise<void> {
    const recipe = await this.recipeRepo.findOne({ where: { id }, relations: ['creator'] });
    if (!recipe) throw new NotFoundException('Recette introuvable');
    if (recipe.creator.id !== userId) throw new ForbiddenException('Vous n\'êtes pas le créateur');
    await this.recipeRepo.remove(recipe);
  }

  async getMyRecipes(userId: number): Promise<Recipe[]> {
    return this.recipeRepo.find({
      where: { creator: { id: userId } } as any,
      order: { createdAt: 'DESC' },
    });
  }

  async like(id: number): Promise<Recipe> {
    const recipe = await this.recipeRepo.findOne({ where: { id } });
    if (!recipe) throw new NotFoundException('Recette introuvable');
    recipe.likesCount += 1;
    return this.recipeRepo.save(recipe);
  }

  async unlike(id: number): Promise<Recipe> {
    const recipe = await this.recipeRepo.findOne({ where: { id } });
    if (!recipe) throw new NotFoundException('Recette introuvable');
    recipe.likesCount = Math.max(0, recipe.likesCount - 1);
    return this.recipeRepo.save(recipe);
  }
}
