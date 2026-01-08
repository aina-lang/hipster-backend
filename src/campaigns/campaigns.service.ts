import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign } from './entities/campaign.entity';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { QueryCampaignsDto } from './dto/query-campaigns.dto';
import { PaginatedResult } from 'src/common/types/paginated-result.type';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,
  ) {}

  /**
   * Créer une campagne
   */
  async create(createCampaignDto: CreateCampaignDto): Promise<Campaign> {
    const campaign = this.campaignRepository.create(createCampaignDto);
    return await this.campaignRepository.save(campaign);
  }

  /**
   * Liste paginée avec filtres
   */
  async findPaginated(
    query: QueryCampaignsDto,
  ): Promise<PaginatedResult<Campaign>> {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      type,
      startDateFrom,
      startDateTo,
    } = query;

    const qb = this.campaignRepository.createQueryBuilder('campaign');

    // Recherche par nom ou description
    if (search) {
      qb.andWhere(
        '(campaign.name LIKE :search OR campaign.description LIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Filtre par statut
    if (status) {
      qb.andWhere('campaign.status = :status', { status });
    }

    // Filtre par type
    if (type) {
      qb.andWhere('campaign.type = :type', { type });
    }

    // Filtre par date de début
    if (startDateFrom && startDateTo) {
      qb.andWhere('campaign.startDate BETWEEN :from AND :to', {
        from: startDateFrom,
        to: startDateTo,
      });
    } else if (startDateFrom) {
      qb.andWhere('campaign.startDate >= :from', { from: startDateFrom });
    } else if (startDateTo) {
      qb.andWhere('campaign.startDate <= :to', { to: startDateTo });
    }

    // Pagination
    const skip = (page - 1) * limit;
    qb.skip(skip).take(limit);

    // Tri par date de création (plus récent en premier)
    qb.orderBy('campaign.createdAt', 'DESC');

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        total,
        totalPages: Math.ceil(total / limit),
        page,
        limit,
      },
    };
  }

  /**
   * Trouver une campagne par ID
   */
  async findOne(id: number): Promise<Campaign> {
    const campaign = await this.campaignRepository.findOne({ where: { id } });
    if (!campaign) {
      throw new NotFoundException(`Campagne #${id} introuvable`);
    }
    return campaign;
  }

  /**
   * Mettre à jour une campagne
   */
  async update(
    id: number,
    updateCampaignDto: UpdateCampaignDto,
  ): Promise<Campaign> {
    const campaign = await this.findOne(id);
    Object.assign(campaign, updateCampaignDto);
    return await this.campaignRepository.save(campaign);
  }

  /**
   * Supprimer une campagne
   */
  async remove(id: number): Promise<{ message: string }> {
    const campaign = await this.findOne(id);
    await this.campaignRepository.remove(campaign);
    return { message: `Campagne #${id} supprimée avec succès` };
  }
}
