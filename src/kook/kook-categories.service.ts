import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecipeCategory } from './entities/recipe-category.entity';

@Injectable()
export class KookCategoriesService {
  constructor(
    @InjectRepository(RecipeCategory)
    private readonly repo: Repository<RecipeCategory>,
  ) {}

  async findAll() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findOne(id: number) {
    const cat = await this.repo.findOne({ where: { id } });
    if (!cat) throw new NotFoundException('Catégorie introuvable');
    return cat;
  }

  async create(data: { name: string; slug?: string; description?: string }) {
    const cat = this.repo.create(data);
    return this.repo.save(cat);
  }

  async update(id: number, data: { name?: string; slug?: string; description?: string }) {
    const cat = await this.findOne(id);
    Object.assign(cat, data);
    return this.repo.save(cat);
  }

  async remove(id: number) {
    const cat = await this.findOne(id);
    await this.repo.remove(cat);
    return { message: 'Catégorie supprimée' };
  }
}
