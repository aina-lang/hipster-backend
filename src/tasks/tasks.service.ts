import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between, LessThan } from 'typeorm';
import { Task, TaskStatus } from './entities/task.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { Project } from 'src/projects/entities/project.entity';
import { EmployeeProfile } from 'src/profiles/entities/employee-profile.entity';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { PaginatedResult } from 'src/common/types/paginated-result.type';
import { ProjectsService } from 'src/projects/projects.service';
import { MailService } from 'src/mail/mail.service';
import { User } from 'src/users/entities/user.entity';

import { Permission } from '../permissions/entities/permission.entity';
import { ClientWebsite } from '../profiles/entities/client-website.entity';
@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,

    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,

    @InjectRepository(EmployeeProfile)
    private readonly employeeRepo: Repository<EmployeeProfile>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,

    @InjectRepository(ClientWebsite)
    private readonly websiteRepo: Repository<ClientWebsite>,

    private readonly projectsService: ProjectsService,
    private readonly mailService: MailService,
  ) {}

  // 🔹 CREATE
  async create(dto: CreateTaskDto, userId: number): Promise<Task> {
    const { projectId, assigneeIds, ...data } = dto;

    const currentUser = await this.userRepo.findOneBy({ id: userId });

    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['client', 'client.user', 'members', 'members.employee'],
    });
    if (!project) throw new NotFoundException('Projet introuvable');

    let assignees: EmployeeProfile[] = [];
    if (assigneeIds?.length) {
      // Les assigneeIds sont des User IDs, pas des EmployeeProfile IDs
      // On cherche les Users et on récupère leur EmployeeProfile
      const users = await this.userRepo.find({
        where: { id: In(assigneeIds) },
        relations: ['employeeProfile', 'employeeProfile.user'],
      });

      if (users.length !== assigneeIds.length) {
        throw new BadRequestException('Un ou plusieurs employés introuvables');
      }

      // Extraire les EmployeeProfiles
      assignees = users
        .map((u) => u.employeeProfile)
        .filter((ep) => ep != null && ep.user != null) as EmployeeProfile[];

      if (assignees.length !== assigneeIds.length) {
        throw new BadRequestException(
          "Un ou plusieurs utilisateurs n'ont pas de profil employé",
        );
      }

      // ✅ VALIDATION: Vérifier que tous les assignés sont membres du projet
      const projectMemberIds = project.members.map((m) => m.employee.id);
      const invalidAssignees = assignees.filter(
        (assignee) =>
          assignee.user && !projectMemberIds.includes(assignee.user.id),
      );

      if (invalidAssignees.length > 0) {
        const invalidNames = invalidAssignees
          .map((a) =>
            a.user ? `${a.user.firstName} ${a.user.lastName}` : 'Inconnu',
          )
          .join(', ');
        throw new BadRequestException(
          `Les employés suivants ne sont pas membres du projet "${project.name}" : ${invalidNames}. Veuillez d'abord les ajouter au projet.`,
        );
      }
    }

    const task = this.taskRepo.create({
      ...data,
      project,
      assignees,
      createdBy: currentUser || undefined,
    });

    const savedTask = await this.taskRepo.save(task);

    // ✅ Send email to assigned employees (excluding current user)
    if (assignees.length > 0) {
      for (const assignee of assignees) {
        // Don't send email to self
        if (assignee.user?.id === currentUser?.id) continue;

        if (assignee.user?.email) {
          try {
            await this.mailService.sendTaskAssignedEmail(assignee.user.email, {
              employeeName: `${assignee.user.firstName} ${assignee.user.lastName}`,
              taskTitle: task.title,
              taskDescription: task.description,
              priority: task.priority || 'medium',
              dueDate: task.dueDate?.toLocaleDateString('fr-FR'),
              projectName: project.name,
              clientName: project.client?.user
                ? `${project.client.user.firstName} ${project.client.user.lastName}`
                : 'N/A',
              assignedBy: currentUser
                ? `${currentUser.firstName} ${currentUser.lastName}`
                : 'Système',
              taskStatus: task.status,
              taskUrl: `${process.env.FRONTEND_URL}/app/project/show?id=${project.id}`,
            });
          } catch (error) {
            console.error(
              `Failed to send task assigned email to ${assignee.user.email}:`,
              error,
            );
          }
        }
      }
    }

    // 🔄 Mettre à jour le statut du projet automatiquement
    if (project) {
      // 🛠️ MAINTENANCE LOGIC: Auto-assign 'manage:maintenance' permission
      if (project.maintenanceConfig?.enabled && assignees.length > 0) {
        await this.ensureMaintenancePermission(assignees);
      }

      await this.projectsService.updateProjectStatus(project.id);
    }

    return savedTask;
  }

  // 🔹 FIND ALL
  async findAll(): Promise<Task[]> {
    const result = await this.findPaginated();
    return result.data;
  }

  async findPaginated(
    query: QueryTasksDto = new QueryTasksDto(),
  ): Promise<PaginatedResult<Task>> {
    const {
      page = 1,
      limit = 25,
      search,
      status,
      priority,
      projectId,
      assigneeId,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = query;

    const qb = this.taskRepo
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.project', 'project')
      .leftJoinAndSelect('task.assignees', 'assignee');

    if (search) {
      qb.andWhere(
        '(task.title LIKE :search OR task.description LIKE :search)',
        {
          search: `%${search}%`,
        },
      );
    }

    if (status) qb.andWhere('task.status = :status', { status });
    if (priority) qb.andWhere('task.priority = :priority', { priority });
    if (projectId) qb.andWhere('project.id = :projectId', { projectId });
    if (assigneeId) qb.andWhere('assignee.id = :assigneeId', { assigneeId });

    const [data, total] = await qb
      .orderBy(`task.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // 🔹 FIND ONE
  async findOne(id: number): Promise<Task> {
    const task = await this.taskRepo.findOne({
      where: { id },
      relations: ['project', 'assignees'],
    });
    if (!task) throw new NotFoundException(`Tâche #${id} introuvable`);
    return task;
  }

  // 🔹 UPDATE
  async update(id: number, dto: UpdateTaskDto, userId: number): Promise<Task> {
    const task = await this.taskRepo.findOne({
      where: { id },
      relations: ['project', 'assignees'],
    });
    if (!task) throw new NotFoundException(`Tâche #${id} introuvable`);

    const currentUser = await this.userRepo.findOneBy({ id: userId });
    if (currentUser) {
      task.updatedBy = currentUser;
    }

    const { projectId, assigneeIds, ...data } = dto;

    // ✅ Allow recurrence for ALL projects now
    // if (hasRecurrence && task.project?.maintenanceConfig?.enabled !== true) {
    //   throw new BadRequestException(
    //     'La configuration de récurrence est uniquement disponible pour les projets de maintenance',
    //   );
    // }

    // Changement de projet
    if (projectId) {
      const project = await this.projectRepo.findOneBy({ id: projectId });
      if (!project) throw new NotFoundException('Projet introuvable');
      task.project = project;
    }

    // Réassignation multiple
    if (assigneeIds) {
      // Fetch project with members for validation
      const projectForValidation = await this.projectRepo.findOne({
        where: { id: task.project.id },
        relations: ['members', 'members.employee'],
      });

      // Les assigneeIds sont des User IDs, pas des EmployeeProfile IDs
      const users = await this.userRepo.find({
        where: { id: In(assigneeIds) },
        relations: ['employeeProfile', 'employeeProfile.user'],
      });

      if (users.length !== assigneeIds.length) {
        throw new BadRequestException('Un ou plusieurs employés introuvables');
      }

      // Extraire les EmployeeProfiles
      const employees = users
        .map((u) => u.employeeProfile)
        .filter((ep) => ep != null && ep.user != null) as EmployeeProfile[];

      if (employees.length !== assigneeIds.length) {
        throw new BadRequestException(
          "Un ou plusieurs utilisateurs n'ont pas de profil employé",
        );
      }

      // ✅ VALIDATION: Vérifier que tous les assignés sont membres du projet
      if (projectForValidation) {
        const projectMemberIds = projectForValidation.members.map(
          (m) => m.employee.id,
        );
        const invalidAssignees = employees.filter(
          (assignee) =>
            assignee.user && !projectMemberIds.includes(assignee.user.id),
        );

        if (invalidAssignees.length > 0) {
          const invalidNames = invalidAssignees
            .map((a) =>
              a.user ? `${a.user.firstName} ${a.user.lastName}` : 'Inconnu',
            )
            .join(', ');
          throw new BadRequestException(
            `Les employés suivants ne sont pas membres du projet "${projectForValidation.name}" : ${invalidNames}. Veuillez d'abord les ajouter au projet.`,
          );
        }
      }

      task.assignees = employees;
    }

    Object.assign(task, data);
    const savedTask = await this.taskRepo.save(task);

    // ✅ If status is DONE and website is linked, update website.lastMaintenanceDate
    if (savedTask.status === TaskStatus.DONE && savedTask.websiteId) {
      await this.websiteRepo.update(savedTask.websiteId, {
        lastMaintenanceDate: new Date(),
        lastMaintenanceById: userId,
      });
      console.log(
        `[TasksService] Updated lastMaintenanceDate for website #${savedTask.websiteId}`,
      );
    }

    // 🛠️ MAINTENANCE LOGIC: Auto-assign 'manage:maintenance' permission
    // Check if project has maintenance enabled (either current project or new project if changed)
    const currentProject = task.project;
    if (
      currentProject?.maintenanceConfig?.enabled &&
      task.assignees?.length > 0
    ) {
      // We need full user entities for assignees if not loaded, but task.assignees coming from save might be partial
      // However, findOne loaded assignees with relations.
      // It's safer to re-fetch assignees if we are unsure, but let's try using what we have.
      // Actually, update method might have just set assignees.
      // Helper expects EmployeeProfile[]
      await this.ensureMaintenancePermission(task.assignees);
    }

    return savedTask;
  }

  // 🔹 DELETE
  async remove(id: number): Promise<{ message: string }> {
    const task = await this.taskRepo.findOneBy({ id });
    if (!task) throw new NotFoundException(`Tâche #${id} introuvable`);
    await this.taskRepo.remove(task);
    return { message: `Tâche #${id} supprimée avec succès` };
  }

  // 🔹 FIND BY PROJECT (for Kanban)
  async findByProject(projectId: number): Promise<Task[]> {
    const project = await this.projectRepo.findOneBy({ id: projectId });
    if (!project) throw new NotFoundException('Projet introuvable');

    return await this.taskRepo.find({
      where: { project: { id: projectId } },
      relations: ['assignees', 'assignees.user'],
      order: { createdAt: 'ASC' },
    });
  }

  // 🔹 UPDATE STATUS (for Kanban drag & drop)
  async updateStatus(
    id: number,
    status: string,
    userId: number,
  ): Promise<Task> {
    const task = await this.taskRepo.findOne({
      where: { id },
      relations: ['assignees', 'assignees.user', 'project'],
    });
    if (!task) throw new NotFoundException(`Tâche #${id} introuvable`);

    const currentUser = await this.userRepo.findOneBy({ id: userId });
    if (currentUser) {
      task.movedBy = currentUser;
      task.movedAt = new Date();
    }

    // ✅ Validate that the status is a valid TaskStatus enum value
    const validStatuses = Object.values(TaskStatus);
    if (!validStatuses.includes(status as TaskStatus)) {
      throw new BadRequestException(
        `Statut invalide: ${status}. Valeurs acceptées: ${validStatuses.join(', ')}`,
      );
    }

    // ✅ Assign the status directly (it's already the enum value)
    task.status = status as TaskStatus;
    console.log(
      `[Task #${id}] Updating status from ${task.status} to ${status}`,
    );

    const savedTask = await this.taskRepo.save(task);
    console.log(`[Task #${id}] Status saved successfully`);

    // ✅ If status is DONE and website is linked, update website.lastMaintenanceDate
    if (savedTask.status === TaskStatus.DONE && savedTask.websiteId) {
      await this.websiteRepo.update(savedTask.websiteId, {
        lastMaintenanceDate: new Date(),
        lastMaintenanceById: userId,
      });
      console.log(
        `[TasksService] Updated lastMaintenanceDate for website #${savedTask.websiteId}`,
      );
    }

    // 🔄 Mettre à jour le statut du projet automatiquement
    if (task.project) {
      console.log(
        `[Task #${id}] Status changed to ${status}, updating project #${task.project.id}`,
      );
      await this.projectsService.updateProjectStatus(task.project.id);
    }

    return savedTask;
  }

  // --------------------------------------------------------
  // ⏰ CRON JOBS (RAPPELS AUTOMATIQUES)
  // --------------------------------------------------------

  // 1. Rappel 24h avant la deadline (tous les jours à 9h)
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async handleDeadlineReminders() {
    console.log('[Cron] Checking for tasks due in 24h...');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);

    const tasks = await this.taskRepo.find({
      where: {
        dueDate: Between(tomorrow, dayAfter),
        status: In([TaskStatus.TODO, TaskStatus.IN_PROGRESS]),
      },
      relations: ['assignees', 'assignees.user', 'project'],
    });

    for (const task of tasks) {
      for (const assignee of task.assignees) {
        if (assignee.user?.email) {
          // TODO: Implement specific reminder email template
          // For now reusing task assigned or a generic reminder
          console.log(
            `[Cron] Sending 24h reminder for task ${task.id} to ${assignee.user.email}`,
          );
          // await this.mailService.sendTaskReminderEmail(...)
        }
      }
    }
  }

  // 2. Rappel de tâche en retard (tous les jours à 10h)
  @Cron(CronExpression.EVERY_DAY_AT_10AM)
  async handleOverdueReminders() {
    console.log('[Cron] Checking for overdue tasks...');
    const now = new Date();

    const tasks = await this.taskRepo.find({
      where: {
        dueDate: LessThan(now),
        status: In([TaskStatus.TODO, TaskStatus.IN_PROGRESS]),
      },
      relations: ['assignees', 'assignees.user', 'project'],
    });

    for (const task of tasks) {
      for (const assignee of task.assignees) {
        if (assignee.user?.email) {
          console.log(
            `[Cron] Sending overdue reminder for task ${task.id} to ${assignee.user.email}`,
          );
          // await this.mailService.sendTaskOverdueEmail(...)
        }
      }
    }
  }

  // 3. Gestion des tâches récurrentes (Maintenance)
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleRecurrence() {
    console.log(
      '[Cron] Checking for recurring tasks in projects with maintenance enabled...',
    );
    const now = new Date();

    // ✅ Récupérer les tâches récurrentes
    const tasks = await this.taskRepo.find({
      where: {
        // Only fetch tasks with recurrence configured
        recurrenceType: In(['daily', 'weekly', 'monthly', 'interval']),
      },
      relations: ['project'],
    });

    // ✅ Filtrer pour ne garder que les tâches des projets avec maintenance activée
    const maintenanceTasks = tasks.filter(
      (task) => task.project?.maintenanceConfig?.enabled === true,
    );

    console.log(
      `[Cron] Found ${maintenanceTasks.length} maintenance tasks to process`,
    );

    const parser = require('cron-parser');

    for (const task of maintenanceTasks) {
      let shouldReset = false;
      const nextRun = task.nextRunAt ? new Date(task.nextRunAt) : null;

      // If nextRunAt is not set, calculate it based on recurrence
      if (!nextRun) {
        // Logic to calculate initial nextRunAt based on recurrenceType
        // For simplicity, we'll check if it matches today's criteria
        shouldReset = this.checkRecurrenceMatch(task, now);
      } else if (now >= nextRun) {
        shouldReset = true;
      }

      if (shouldReset) {
        console.log(
          `[Cron] Resetting recurring task #${task.id} (${task.title}) for maintenance project #${task.project.id}`,
        );

        // Reset status to TODO
        task.status = TaskStatus.TODO;
        task.dueDate = now; // Set due date to today

        // Calculate NEXT run date
        task.nextRunAt = this.calculateNextRun(task, now);

        await this.taskRepo.save(task);
      }
    }
  }

  private checkRecurrenceMatch(task: Task, date: Date): boolean {
    const dayName = date
      .toLocaleDateString('en-US', { weekday: 'long' })
      .toLowerCase();

    // Normalisation : si recurrenceDays contient des jours, on vérifie
    const hasSpecificDays =
      task.recurrenceDays && task.recurrenceDays.length > 0;

    switch (task.recurrenceType) {
      case 'daily':
        return true;
      case 'weekly':
      case 'custom': // Support 'custom' type explicitly
        return hasSpecificDays ? task.recurrenceDays!.includes(dayName) : false;
      case 'monthly':
        return (
          date.getDate() ===
          (task.dueDate ? new Date(task.dueDate).getDate() : 1)
        );
      case 'interval':
        // Complex to check without reference, assume false if not tracked by nextRunAt
        return false;
      default:
        // Fallback: if type is none but days are set, assume weekly/custom logic
        if (hasSpecificDays) {
          return task.recurrenceDays!.includes(dayName);
        }
        return false;
    }
  }

  private async ensureMaintenancePermission(employees: EmployeeProfile[]) {
    const maintenanceSlug = 'manage:maintenance';
    const permission = await this.permissionRepo.findOne({
      where: { slug: maintenanceSlug },
    });

    if (!permission) return;

    for (const employee of employees) {
      if (!employee.user) continue;

      // Need to fetch user with permissions to check
      const user = await this.userRepo.findOne({
        where: { id: employee.user.id },
        relations: ['permissions'],
      });

      if (user && !user.permissions.some((p) => p.slug === maintenanceSlug)) {
        user.permissions.push(permission);
        await this.userRepo.save(user);
        console.log(
          `[TasksService] Auto-assigned '${maintenanceSlug}' to user ${user.email} (assigned to maintenance task)`,
        );
      }
    }
  }

  private calculateNextRun(task: Task, fromDate: Date): Date {
    const nextDate = new Date(fromDate);
    // Start looking from tomorrow
    nextDate.setDate(nextDate.getDate() + 1);
    nextDate.setHours(0, 0, 0, 0);

    const hasSpecificDays =
      task.recurrenceDays && task.recurrenceDays.length > 0;

    switch (task.recurrenceType) {
      case 'daily':
        // C'est déjà +1 jour
        break;

      case 'weekly':
      case 'custom':
        if (!hasSpecificDays) {
          // Fallback default 1 week if no days set? Or just +1 day?
          // Let's assume +1 week if strictly 'weekly' and empty, but here +1 day is safer if malformed
          nextDate.setDate(nextDate.getDate() + 6); // +1 (already) + 6 = +7
        } else {
          // Find next matching day
          // On cherche le prochain jour valide dans les 14 prochains jours
          for (let i = 0; i < 14; i++) {
            const currentDayName = nextDate
              .toLocaleDateString('en-US', { weekday: 'long' })
              .toLowerCase();

            if (task.recurrenceDays!.includes(currentDayName)) {
              return nextDate;
            }
            nextDate.setDate(nextDate.getDate() + 1);
          }
        }
        break;

      case 'monthly':
        nextDate.setMonth(nextDate.getMonth() + 1);
        // Ajuster si on tombe sur un jour inexistant (ex: 31 fevrier) -> 28/29
        // Mais Date() gère ça en passant au mois d'après, on peut vouloir rester sur le dernier jour
        // Simple implementation for now:
        break;

      case 'interval':
        // Déjà +1 jour, donc on ajoute (interval - 1)
        if (task.recurrenceInterval && task.recurrenceInterval > 1) {
          nextDate.setDate(nextDate.getDate() + (task.recurrenceInterval - 1));
        }
        break;
    }

    return nextDate;
  }
}
