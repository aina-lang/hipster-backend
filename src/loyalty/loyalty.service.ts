import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { Project, ProjectStatus } from 'src/projects/entities/project.entity';
import { User } from 'src/users/entities/user.entity';
import { LOYALTY_RULES, LoyaltyStatus, LoyaltyTier } from './loyalty.types';

@Injectable()
export class LoyaltyService {
  constructor(
    @InjectRepository(ClientProfile)
    private readonly clientRepo: Repository<ClientProfile>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}
  
  async getLoyaltyDetailByUserId(userId: number) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['clientProfile'],
    });
    if (!user || !user.clientProfile) {
      throw new NotFoundException('Client profile not found for this user');
    }
    return this.getClientLoyaltyDetail(user.clientProfile.id);
  }

  async getLoyaltyStatus(clientId: number): Promise<LoyaltyStatus> {
    // Check if client exists
    const client = await this.clientRepo.findOne({ where: { id: clientId } });
    if (!client) throw new NotFoundException(`Client #${clientId} not found`);

    // Count signed/completed projects (only COMPLETED projects count as "signed")
    const allProjects = await this.projectRepo.find({
      where: { client: { id: clientId } },
    });
    console.log(
      `DEBUG: Loyalty check for client ${clientId}. Found ${allProjects.length} total projects.`,
    );
    allProjects.forEach((p) =>
      console.log(`DEBUG: Project ID: ${p.id}, Status: ${p.status}`),
    );

    const projectCount = allProjects.filter(
      (p) => p.status === ProjectStatus.COMPLETED,
    ).length;
    console.log(`DEBUG: Final projectCount for loyalty: ${projectCount}`);

    // Determine Tier
    let tier = LoyaltyTier.STANDARD;
    if (projectCount >= LOYALTY_RULES[LoyaltyTier.GOLD].minProjects)
      tier = LoyaltyTier.GOLD;
    else if (projectCount >= LOYALTY_RULES[LoyaltyTier.SILVER].minProjects)
      tier = LoyaltyTier.SILVER;
    else if (projectCount >= LOYALTY_RULES[LoyaltyTier.BRONZE].minProjects)
      tier = LoyaltyTier.BRONZE;

    // Calculate Next Tier
    let nextTier: LoyaltyTier | undefined;
    let projectsToNextTier = 0;
    let progress = 100;

    if (tier === LoyaltyTier.STANDARD) {
      nextTier = LoyaltyTier.BRONZE;
      projectsToNextTier =
        LOYALTY_RULES[LoyaltyTier.BRONZE].minProjects - projectCount;
      progress =
        (projectCount / LOYALTY_RULES[LoyaltyTier.BRONZE].minProjects) * 100;
    } else if (tier === LoyaltyTier.BRONZE) {
      nextTier = LoyaltyTier.SILVER;
      projectsToNextTier =
        LOYALTY_RULES[LoyaltyTier.SILVER].minProjects - projectCount;
      const range =
        LOYALTY_RULES[LoyaltyTier.SILVER].minProjects -
        LOYALTY_RULES[LoyaltyTier.BRONZE].minProjects;
      const currentInTier =
        projectCount - LOYALTY_RULES[LoyaltyTier.BRONZE].minProjects;
      progress = (currentInTier / range) * 100;
    } else if (tier === LoyaltyTier.SILVER) {
      nextTier = LoyaltyTier.GOLD;
      projectsToNextTier =
        LOYALTY_RULES[LoyaltyTier.GOLD].minProjects - projectCount;
      const range =
        LOYALTY_RULES[LoyaltyTier.GOLD].minProjects -
        LOYALTY_RULES[LoyaltyTier.SILVER].minProjects;
      const currentInTier =
        projectCount - LOYALTY_RULES[LoyaltyTier.SILVER].minProjects;
      progress = (currentInTier / range) * 100;
    }

    return {
      tier,
      projectCount,
      nextTier,
      projectsToNextTier: projectsToNextTier > 0 ? projectsToNextTier : 0,
      currentReward: LOYALTY_RULES[tier].reward,
      nextReward: nextTier ? LOYALTY_RULES[nextTier].reward : undefined,
      progress: Math.min(Math.max(progress, 0), 100),
    };
  }

  async getClientLoyaltyDetail(clientId: number) {
    const client = await this.clientRepo.findOne({
      where: { id: clientId },
      relations: ['user', 'projects'],
    });

    if (!client) throw new NotFoundException(`Client #${clientId} not found`);

    // Get completed projects sorted by completion date
    const completedProjects = client.projects
      .filter((p) => p.status === ProjectStatus.COMPLETED)
      .sort((a, b) => {
        const dateA = a.real_end_date || a.updatedAt;
        const dateB = b.real_end_date || b.updatedAt;
        return new Date(dateA).getTime() - new Date(dateB).getTime();
      });

    // Calculate tier progression over time
    const tierHistory: any[] = [];
    let cumulativeCount = 0;

    for (const project of completedProjects) {
      cumulativeCount++;
      let tier = LoyaltyTier.STANDARD;
      if (cumulativeCount >= LOYALTY_RULES[LoyaltyTier.GOLD].minProjects)
        tier = LoyaltyTier.GOLD;
      else if (cumulativeCount >= LOYALTY_RULES[LoyaltyTier.SILVER].minProjects)
        tier = LoyaltyTier.SILVER;
      else if (cumulativeCount >= LOYALTY_RULES[LoyaltyTier.BRONZE].minProjects)
        tier = LoyaltyTier.BRONZE;

      tierHistory.push({
        projectId: project.id,
        projectName: project.name,
        completedAt: project.real_end_date || project.updatedAt,
        projectNumber: cumulativeCount,
        tierReached: tier,
        rewardUnlocked: LOYALTY_RULES[tier].reward,
      });
    }

    // Get current status
    const currentStatus = await this.getLoyaltyStatus(clientId);

    return {
      client: {
        id: client.id,
        firstName: client.user?.firstName,
        lastName: client.user?.lastName,
        companyName: client.companyName,
        avatarUrl: client.user?.avatarUrl,
      },
      currentStatus,
      tierHistory,
      totalProjects: completedProjects.length,
      projectsInProgress: client.projects.filter(
        (p) => p.status === ProjectStatus.IN_PROGRESS,
      ).length,
    };
  }

  async getAllLoyaltyStatuses(): Promise<any[]> {
    const clients = await this.clientRepo.find({
      relations: ['user', 'projects'],
    });

    const results: any[] = [];

    for (const client of clients) {
      // Count signed/completed projects (only COMPLETED projects count as "signed")
      const projectCount = client.projects.filter(
        (p) => p.status === ProjectStatus.COMPLETED,
      ).length;

      // Determine Tier
      let tier = LoyaltyTier.STANDARD;
      if (projectCount >= LOYALTY_RULES[LoyaltyTier.GOLD].minProjects)
        tier = LoyaltyTier.GOLD;
      else if (projectCount >= LOYALTY_RULES[LoyaltyTier.SILVER].minProjects)
        tier = LoyaltyTier.SILVER;
      else if (projectCount >= LOYALTY_RULES[LoyaltyTier.BRONZE].minProjects)
        tier = LoyaltyTier.BRONZE;

      // Calculate Next Tier
      let nextTier: LoyaltyTier | undefined;
      let projectsToNextTier = 0;
      let progress = 100;

      if (tier === LoyaltyTier.STANDARD) {
        nextTier = LoyaltyTier.BRONZE;
        projectsToNextTier =
          LOYALTY_RULES[LoyaltyTier.BRONZE].minProjects - projectCount;
        progress =
          (projectCount / LOYALTY_RULES[LoyaltyTier.BRONZE].minProjects) * 100;
      } else if (tier === LoyaltyTier.BRONZE) {
        nextTier = LoyaltyTier.SILVER;
        projectsToNextTier =
          LOYALTY_RULES[LoyaltyTier.SILVER].minProjects - projectCount;
        const range =
          LOYALTY_RULES[LoyaltyTier.SILVER].minProjects -
          LOYALTY_RULES[LoyaltyTier.BRONZE].minProjects;
        const currentInTier =
          projectCount - LOYALTY_RULES[LoyaltyTier.BRONZE].minProjects;
        progress = (currentInTier / range) * 100;
      } else if (tier === LoyaltyTier.SILVER) {
        nextTier = LoyaltyTier.GOLD;
        projectsToNextTier =
          LOYALTY_RULES[LoyaltyTier.GOLD].minProjects - projectCount;
        const range =
          LOYALTY_RULES[LoyaltyTier.GOLD].minProjects -
          LOYALTY_RULES[LoyaltyTier.SILVER].minProjects;
        const currentInTier =
          projectCount - LOYALTY_RULES[LoyaltyTier.SILVER].minProjects;
        progress = (currentInTier / range) * 100;
      }

      results.push({
        client: {
          id: client.id,
          firstName: client.user?.firstName,
          lastName: client.user?.lastName,
          companyName: client.companyName,
          avatarUrl: client.user?.avatarUrl,
        },
        status: {
          tier,
          projectCount,
          nextTier,
          projectsToNextTier: projectsToNextTier > 0 ? projectsToNextTier : 0,
          currentReward: LOYALTY_RULES[tier].reward,
          nextReward: nextTier ? LOYALTY_RULES[nextTier].reward : undefined,
          progress: Math.min(Math.max(progress, 0), 100),
        },
      });
    }

    return results;
  }
  async updateClientLoyaltyOnProjectCompletion(projectId: number): Promise<{
    oldTier: LoyaltyTier;
    newTier: LoyaltyTier;
    tierUpgraded: boolean;
  }> {
    // 1. Récupérer le projet avec le client
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['client'],
    });

    if (!project || !project.client) {
      throw new NotFoundException('Project or client not found');
    }

    const clientId = project.client.id;

    // 2. Calculer l'ancien tier
    const oldStatus = await this.getLoyaltyStatus(clientId);
    const oldTier = oldStatus.tier;

    // 3. Compter les projets complétés
    const completedProjectsCount = await this.projectRepo.count({
      where: { client: { id: clientId }, status: ProjectStatus.COMPLETED },
    });

    // 4. Calculer les points (100 points par projet)
    const loyaltyPoints = completedProjectsCount * 100;

    // 5. Calculer le cashback (5% du budget total des projets complétés)
    const completedProjects = await this.projectRepo.find({
      where: { client: { id: clientId }, status: ProjectStatus.COMPLETED },
    });
    const totalBudget = completedProjects.reduce(
      (sum, p) => sum + Number(p.budget || 0),
      0,
    );
    const cashbackTotal = totalBudget * 0.05;

    // 6. Mettre à jour le client
    await this.clientRepo.update(clientId, {
      loyaltyPoints,
      cashbackTotal,
    });

    // 7. Calculer le nouveau tier
    const newStatus = await this.getLoyaltyStatus(clientId);
    const newTier = newStatus.tier;

    return {
      oldTier,
      newTier,
      tierUpgraded: oldTier !== newTier,
    };
  }
}
