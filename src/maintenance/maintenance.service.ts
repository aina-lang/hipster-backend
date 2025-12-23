import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Project, ProjectStatus } from 'src/projects/entities/project.entity';
import { ClientWebsite } from 'src/profiles/entities/client-website.entity';
import { Task, TaskStatus, TaskPriority } from 'src/tasks/entities/task.entity';
import { NotificationsService } from 'src/notifications/notifications.service';
import { ProjectMember } from 'src/projects/entities/project-member.entity';

const MAINTENANCE_PROJECT_NAME = 'Maintenance Sites Web';

@Injectable()
export class MaintenanceService implements OnModuleInit {
  constructor(
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    @InjectRepository(ClientWebsite)
    private websiteRepository: Repository<ClientWebsite>,
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
    private notificationsService: NotificationsService,
  ) { }

  /**
   * ✅ Auto-cleanup duplicates on startup
   */
  async onModuleInit() {
    console.log('[Maintenance] Checking for duplicate projects on startup...');
    try {
      // Trigger the self-healing logic
      await this.getOrCreateMaintenanceProject(1); // Use system user ID 1
    } catch (error) {
      console.error('[Maintenance] Failed to clean up duplicates:', error);
    }
  }

  /**
   * Get or create THE global maintenance project
   */
  async getOrCreateMaintenanceProject(userId: number): Promise<Project> {
    // 1. Find ALL potential maintenance projects (fuzzy match to catch typos like "Weble")
    // ⚡ OPTIMIZED: Do NOT fetch relations here. It causes massive slowdowns.
    const projects = await this.projectRepository.find({
      where: { name: Like('Maintenance Sites Web%') },
      order: { createdAt: 'ASC' } // Oldest first
    });

    let project: Project;

    if (projects.length > 0) {
      // Pick the best candidate: exact match or the first one (oldest)
      const exactMatch = projects.find(p => p.name === MAINTENANCE_PROJECT_NAME);
      project = exactMatch || projects[0];

      // Fix name if it was a typo/variant
      if (project.name !== MAINTENANCE_PROJECT_NAME) {
        project.name = MAINTENANCE_PROJECT_NAME;
        await this.projectRepository.save(project);
      }

      // ✅ Delete duplicates
      const duplicates = projects.filter(p => p.id !== project.id);
      if (duplicates.length > 0) {
        console.warn(`[Maintenance] Removing ${duplicates.length} duplicate projects: ${duplicates.map(p => p.id).join(', ')}`);
        await this.projectRepository.remove(duplicates);
      }

      // ✅ Ensure maintenance config is enabled
      if (!project.maintenanceConfig || !project.maintenanceConfig.enabled) {
        project.maintenanceConfig = { enabled: true, frequency: 'custom' };
        await this.projectRepository.save(project);
      }

      return project;
    }

    // Create new maintenance project if none found
    project = this.projectRepository.create({
      name: MAINTENANCE_PROJECT_NAME,
      description: 'Projet global de maintenance des sites WordPress de tous les clients',
      start_date: new Date(),
      status: ProjectStatus.IN_PROGRESS,
      budget: 0,
      maintenanceConfig: { enabled: true, frequency: 'custom' }, // ✅ Force enable maintenance
    });

    return this.projectRepository.save(project);
  }

  /**
   * Add a website to maintenance (creates a task)
   */
  async addWebsiteToMaintenance(websiteId: number, userId: number): Promise<Task> {
    const website = await this.websiteRepository.findOne({
      where: { id: websiteId },
      relations: ['client', 'client.user'],
    });

    if (!website) {
      throw new NotFoundException('Site web non trouvé');
    }

    // Get or create maintenance project
    const project = await this.getOrCreateMaintenanceProject(userId);

    // Check if website already in maintenance
    const existing = await this.taskRepository.findOne({
      where: {
        websiteId,
        project: { id: project.id },
      },
    });

    if (existing) {
      return existing;
    }

    // Create task for this website
    const clientName = website.client?.user
      ? `${website.client.user.firstName} ${website.client.user.lastName}`
      : 'Client inconnu';

    const task = this.taskRepository.create({
      title: `${website.url} - ${clientName}`,
      description: `Maintenance du site WordPress\nURL: ${website.url}\nLogin: ${website.adminLogin}\nPassword: ${website.adminPassword}\nClient: ${clientName}`,
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      project,
      websiteId,
      createdBy: { id: userId } as any,
      // Inherit global schedule
      recurrenceType: project.recurrenceType,
      recurrenceInterval: project.recurrenceInterval,
      recurrenceDays: project.recurrenceDays,
    });

    return this.taskRepository.save(task);
  }

  /**
   * Remove website from maintenance (deletes task)
   */
  async removeWebsiteFromMaintenance(websiteId: number): Promise<void> {
    const project = await this.getOrCreateMaintenanceProject(1); // userId doesn't matter here

    const task = await this.taskRepository.findOne({
      where: {
        websiteId,
        project: { id: project.id },
      },
    });

    if (task) {
      await this.taskRepository.remove(task);
    }
  }

  /**
   * Get all websites currently in maintenance
   */
  async getMaintenanceWebsites(): Promise<Task[]> {
    const project = await this.getOrCreateMaintenanceProject(1);

    return this.taskRepository.find({
      where: { project: { id: project.id } },
      relations: ['website', 'website.client', 'website.client.user', 'assignees', 'assignees.user'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get maintenance project with all tasks and ALL websites
   */
  async getMaintenanceProject(userId: number): Promise<Project> {
    const basicProject = await this.getOrCreateMaintenanceProject(userId);

    // ⚡ OPTIMIZED: Fetch full details separately only when needed
    const project = await this.projectRepository.findOne({
      where: { id: basicProject.id },
      relations: ['members', 'members.employee']
    });

    // For the maintenance project, we want to see ALL client websites
    // so we can manage them
    const websites = await this.websiteRepository.find({
      relations: ['client', 'client.user', 'lastMaintenanceBy'],
      order: { url: 'ASC' }
    });

    if (project) {
      project.websites = websites;
      return project;
    }
    return basicProject; // Should not happen given getOrCreate logic
  }
  /**
   * Update global maintenance schedule
   */
  async updateGlobalSchedule(userId: number, schedule: { recurrenceType: string; recurrenceInterval?: number; recurrenceDays?: string[] }): Promise<Project> {
    const project = await this.getOrCreateMaintenanceProject(userId);

    // Update project settings
    project.recurrenceType = schedule.recurrenceType;
    project.recurrenceInterval = schedule.recurrenceInterval;
    project.recurrenceDays = schedule.recurrenceDays;

    const savedProject = await this.projectRepository.save(project);

    // Update ALL existing maintenance tasks
    const tasks = await this.taskRepository.find({
      where: { project: { id: project.id } },
    });

    for (const task of tasks) {
      task.recurrenceType = schedule.recurrenceType;
      task.recurrenceInterval = schedule.recurrenceInterval;
      task.recurrenceDays = schedule.recurrenceDays;
      await this.taskRepository.save(task);
    }

    return savedProject;
  }

  /**
   * Cron job: REMOVED - we now rely on individual task cron in TasksService
   * This method remains valid for manual triggers or debugging
   */
  // @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleMaintenanceSchedule() {
    console.log('[Maintenance Cron] (Global Trigger Disabled) Checking maintenance schedule...');

    try {
      const project = await this.projectRepository.findOne({
        where: { name: MAINTENANCE_PROJECT_NAME },
        relations: ['members', 'members.employee'],
      });

      if (!project) {
        return;
      }

      // Logic moved to TasksService.handleRecurrence()
      // This method used to reset ALL tasks based on global project settings.
      // We now prefer individual task settings.

    } catch (error) {
      console.error('[Maintenance Cron] Error:', error);
    }
  }

  /**
   * Check if today matches the project's recurrence schedule
   */
  private checkScheduleMatch(project: Project, date: Date): boolean {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    switch (project.recurrenceType) {
      case 'daily':
        return true;
      case 'weekly':
        return project.recurrenceDays?.includes(dayName) || false;
      case 'monthly':
        // Check if today is the same day of month as start_date
        return date.getDate() === (project.start_date ? new Date(project.start_date).getDate() : 1);
      case 'interval':
        // Complex to check without reference, would need lastRunDate tracking
        return false;
      case 'none':
      default:
        return false;
    }
  }

  /**
   * Get maintenance statistics
   */
  async getMaintenanceStats(projectId: number): Promise<any> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Project not found');

    const websites = await this.websiteRepository.find();
    const totalWebsites = websites.length;

    // Check maintenance status based on tasks or lastMaintenanceDate
    // For now, let's assume if lastMaintenanceDate is > 30 days ago, it needs maintenance
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const websitesWithMaintenance = websites.filter(w => w.lastMaintenanceDate && w.lastMaintenanceDate > oneMonthAgo).length;
    const websitesNeedingMaintenance = totalWebsites - websitesWithMaintenance;

    // Tasks stats
    const tasks = await this.taskRepository.find({ where: { project: { id: projectId } } });
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === TaskStatus.DONE).length;
    const completionPercentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    return {
      totalWebsites,
      websitesWithMaintenance,
      websitesNeedingMaintenance,
      totalTasks,
      completedTasks,
      completionPercentage
    };
  }

  /**
   * Mark website maintenance as completed
   */
  async completeWebsiteMaintenance(websiteId: number, userId: number): Promise<void> {
    const website = await this.websiteRepository.findOne({ where: { id: websiteId } });
    if (!website) throw new NotFoundException('Website not found');

    // Update website
    website.lastMaintenanceDate = new Date();
    website.lastMaintenanceById = userId;
    await this.websiteRepository.save(website);

    // Find and update related task if exists
    // We need to find the active maintenance task for this website
    const task = await this.taskRepository.findOne({
      where: {
        websiteId: websiteId,
        // We look for non-completed tasks
        status: TaskStatus.TODO // We could also check IN_PROGRESS
      },
      order: { createdAt: 'DESC' }
    });

    if (task) {
      task.status = TaskStatus.DONE;
      await this.taskRepository.save(task);
    }
  }
}
