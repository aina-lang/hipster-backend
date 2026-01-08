import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Like } from 'typeorm';
import { Project, ProjectStatus } from './entities/project.entity';
import { ProjectMember } from './entities/project-member.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { ClientWebsite } from 'src/profiles/entities/client-website.entity';
import { EmployeeProfile } from 'src/profiles/entities/employee-profile.entity';
import { Permission } from 'src/permissions/entities/permission.entity';
import { User } from 'src/users/entities/user.entity';
import { File } from 'src/files/entities/file.entity';
import { Task, TaskStatus } from 'src/tasks/entities/task.entity';
import { FindProjectsQueryDto } from './dto/find-projects-query.dto';
import { PaginatedResult } from 'src/common/types/paginated-result.type';
import { MailService } from 'src/mail/mail.service';
import { LoyaltyService } from 'src/loyalty/loyalty.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { LOYALTY_RULES } from 'src/loyalty/loyalty.types';

import { Invoice } from 'src/invoices/entities/invoice.entity';
import { Payment } from 'src/payments/entities/payment.entity';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,

    @InjectRepository(ClientProfile)
    private readonly clientProfileRepo: Repository<ClientProfile>,

    @InjectRepository(EmployeeProfile)
    private readonly employeeProfileRepo: Repository<EmployeeProfile>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(File)
    private readonly fileRepo: Repository<File>,

    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,

    @InjectRepository(ProjectMember)
    private readonly memberRepo: Repository<ProjectMember>,

    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,

    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,

    @InjectRepository(ClientWebsite)
    private readonly websiteRepo: Repository<ClientWebsite>,

    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,

    private readonly mailService: MailService,
    private readonly loyaltyService: LoyaltyService,
    private readonly notificationsService: NotificationsService,
  ) { }

  // ------------------------------------------------------------
  // 🔹 CREATE PROJECT
  // ------------------------------------------------------------
  async create(dto: CreateProjectDto, userId: number): Promise<Project> {
    const { clientId, members, fileIds, taskIds, ...data } = dto;

    // 🛑 Prevent manual creation of Maintenance Project
    if (data.name === 'Maintenance Sites Web' || data.name?.startsWith('Maintenance Sites Web')) {
      throw new BadRequestException('Ce nom de projet est réservé. Veuillez utiliser le module Maintenance.');
    }

    console.log('Creating project with members:', members);

    const currentUser = await this.userRepo.findOneBy({ id: userId });
    if (!currentUser) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    let clientUser: User | null = null;
    let client: ClientProfile | null = null;

    // Vérifier le client (clientId est un User ID) SI fourni
    if (clientId) {
      clientUser = await this.userRepo.findOne({
        where: { id: clientId },
        relations: ['clientProfile'],
      });

      if (!clientUser || !clientUser.clientProfile) {
        throw new NotFoundException(
          'Profil client introuvable pour cet utilisateur',
        );
      }
      client = clientUser.clientProfile;
    }

    // Créer le projet
    const project = this.projectRepo.create({
      ...data,
      status: ProjectStatus.PLANNED,
      createdBy: currentUser,
      updatedBy: currentUser,
    });

    if (client) {
      project.client = client;
    }

    await this.projectRepo.save(project);

    // ✅ Ajouter les membres
    const memberUsers: { user: User; role: string }[] = [];
    if (members && members.length > 0) {
      for (const m of members) {
        // On cherche l'utilisateur directement
        const user = await this.userRepo.findOneBy({ id: m.employeeId });

        if (!user)
          throw new BadRequestException(
            `Utilisateur ${m.employeeId} introuvable`,
          );

        const membership = this.memberRepo.create({
          project,
          employee: user, // On lie directement l'utilisateur
          role: m.role,
        });
        await this.memberRepo.save(membership);
        memberUsers.push({ user, role: m.role });
      }
    }

    // ✅ Lier les fichiers
    if (fileIds?.length) {
      const files = await this.fileRepo.findBy({ id: In(fileIds) });
      project.files = files;
    }

    // ✅ Lier les tâches
    if (taskIds?.length) {
      const tasks = await this.taskRepo.findBy({ id: In(taskIds) });
      project.tasks = tasks;
    }

    await this.projectRepo.save(project);
    await this.updateProjectStatus(project.id);
    await this.assignMaintenancePermissionToMembers(project.id);

    // ✅ Send email to client (ONLY if client exists)
    if (clientUser && clientUser.email) {
      try {
        await this.mailService.sendProjectCreatedEmail(
          clientUser.email,
          {
            clientName: `${clientUser.firstName} ${clientUser.lastName}`,
            projectName: project.name,
            startDate: new Date(project.start_date).toLocaleDateString('fr-FR'),
            endDate: project.end_date
              ? new Date(project.end_date).toLocaleDateString('fr-FR')
              : 'Non définie',
            budget: project.budget,
            projectUrl: `${process.env.FRONTEND_URL}/app/project/show?id=${project.id}`,
          },
          clientUser.roles,
        );
      } catch (error) {
        console.error('Failed to send project created email to client:', error);
      }
    }

    // ✅ Send email to members
    if (memberUsers.length > 0) {
      const memberIds = memberUsers.map((m) => m.user.id);

      // Send real-time + email notifications to assigned members
      try {
        await this.notificationsService.notifyProjectMembers(
          project.id,
          project.name,
          memberIds,
          'Vous avez été assigné au projet',
        );
      } catch (error) {
        console.error(
          'Failed to send project assignment notifications:',
          error,
        );
      }

      // Send individual emails
      for (const member of memberUsers) {
        if (member.user.email) {
          try {
            await this.mailService.sendProjectAssignmentEmail(
              member.user.email,
              {
                memberName: `${member.user.firstName} ${member.user.lastName}`,
                projectName: project.name,
                projectDescription: project.description,
                role: member.role,
                startDate: project.start_date
                  ? new Date(project.start_date).toLocaleDateString('fr-FR')
                  : undefined,
                endDate: project.end_date
                  ? new Date(project.end_date).toLocaleDateString('fr-FR')
                  : undefined,
              },
            );
          } catch (error) {
            console.error(
              `Failed to send project assignment email to member ${member.user.email}:`,
              error,
            );
          }
        }
      }
    }

    // ✅ If created by a client, notify all admins
    if (clientUser && clientUser.roles?.includes('client_marketing' as any)) {
      try {
        // Get all admin users
        const admins = await this.userRepo.find({
          where: { roles: Like('%admin%') as any }, // Use Like for array/string match if needed, or check logic
        });
        // Note: roles is simple-array or json. If simple-array, Like works. If json, need specific query.
        // Assuming simple-array for now as per other code.
        // Actually, previous code used In(['admin']) which might not work for simple-array if multiple roles.
        // Let's stick to what was there or improve.
        // The previous code was: where: { roles: In(['admin']) } which is wrong for simple-array if user has multiple roles.
        // But let's keep it simple for now or use a better query if possible.
        // Better: fetch all and filter in JS if not many users, or use LIKE.

        const adminIds = admins
          .filter((a) => a.roles.includes('admin' as any))
          .map((a) => a.id);

        if (adminIds.length > 0) {
          // Send real-time + email notifications to admins
          await this.notificationsService.createProjectSubmissionNotification(
            project.id,
            project.name,
            clientId,
            adminIds,
          );

          // Send individual emails
          for (const admin of admins) {
            if (admin.roles.includes('admin' as any) && admin.email) {
              await this.mailService.sendProjectSubmissionEmail(admin.email, {
                adminName: `${admin.firstName} ${admin.lastName}`,
                projectName: project.name,
                clientName: `${clientUser.firstName} ${clientUser.lastName}`,
                projectDescription: project.description,
              });
            }
          }
        }
      } catch (error) {
        console.error(
          'Failed to send project submission notifications:',
          error,
        );
      }
    }

    return this.findOne(project.id);
  }

  // ------------------------------------------------------------
  // 🔹 ASSIGN MAINTENANCE PERMISSION
  // ------------------------------------------------------------
  private async assignMaintenancePermissionToMembers(projectId: number) {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['members', 'members.employee', 'members.employee.permissions'],
    });

    if (!project || project.name !== 'Maintenance Sites Web') return;

    const maintenancePerm = await this.permissionRepo.findOneBy({
      slug: 'manage:maintenance',
    });

    if (!maintenancePerm) return;

    for (const member of project.members) {
      const user = member.employee;
      const hasPerm = user.permissions?.some((p) => p.id === maintenancePerm.id);

      if (!hasPerm) {
        if (!user.permissions) user.permissions = [];
        user.permissions.push(maintenancePerm);
        await this.userRepo.save(user);
        console.log(
          `[Maintenance] Assigned permission to ${user.firstName} ${user.lastName}`,
        );

        // ✅ Send maintenance assignment email
        if (user.email) {
          try {
            await this.mailService.sendMaintenanceAssignedEmail(
              user.email,
              {
                assigneeName: `${user.firstName} ${user.lastName}`,
                websiteUrl: 'Sites WordPress clients',
                projectName: project.name,
                taskDescription:
                  'Vous êtes maintenant membre de l’équipe de maintenance. Vous recevrez des tâches de maintenance pour les différents sites web de nos clients.',
                recurrenceInfo: project.recurrenceType || 'Selon planification',
              },
            );
            console.log(
              `[Maintenance] Sent assignment email to ${user.email}`,
            );
          } catch (error) {
            console.error(
              `Failed to send maintenance assignment email to ${user.email}:`,
              error,
            );
          }
        }
      }
    }
  }

  // ------------------------------------------------------------
  // 🔹 FIND ALL
  // ------------------------------------------------------------
  async findAll(): Promise<Project[]> {
    return this.projectRepo.find({
      relations: [
        'client',
        'client.user',
        'members',
        'members.employee',
        'files',
        'tasks',
        'createdBy',
        'updatedBy',
      ],
      order: { createdAt: 'DESC' },
    });
  }

  // ------------------------------------------------------------
  // 🔹 FIND ONE
  // ------------------------------------------------------------
  async findOne(id: number): Promise<Project> {
    const project = await this.projectRepo.findOne({
      where: { id },
      relations: [
        'client',
        'client.user',
        'members',
        'members.employee',
        'members.employee.employeeProfile',
        'files',
        'tasks',
        'createdBy',
        'createdBy',
        'updatedBy',
        'websites',
      ],
    });
    if (!project) throw new NotFoundException(`Projet #${id} introuvable`);
    console.log('Loaded project members:', project.members);
    project.progress = this.calculateProgress(project.tasks || []);
    return project;
  }

  // ------------------------------------------------------------
  // 🔹 UPDATE PROJECT
  // ------------------------------------------------------------
  async update(
    id: number,
    dto: UpdateProjectDto,
    userId: number,
  ): Promise<Project> {
    const project = await this.projectRepo.findOne({
      where: { id },
      relations: ['client', 'files', 'tasks', 'members'],
    });
    if (!project) throw new NotFoundException(`Projet #${id} introuvable`);

    const currentUser = await this.userRepo.findOneBy({ id: userId });
    if (currentUser) {
      project.updatedBy = currentUser;
    }

    const { clientId, members, fileIds, taskIds, ...data } = dto;
    console.log('Updating project members:', members);

    // ✅ Client
    if (clientId) {
      const clientUser = await this.userRepo.findOne({
        where: { id: clientId },
        relations: ['clientProfile'],
      });

      if (!clientUser || !clientUser.clientProfile) {
        throw new NotFoundException(
          'Profil client introuvable pour cet utilisateur',
        );
      }
      project.client = clientUser.clientProfile;
    }

    // ✅ Fichiers
    if (fileIds) {
      const files = await this.fileRepo.findBy({ id: In(fileIds) });
      project.files = files;
    }

    // ✅ Tâches
    if (taskIds) {
      const tasks = await this.taskRepo.findBy({ id: In(taskIds) });
      project.tasks = tasks;
    }

    // ✅ Membres
    if (members) {
      // Clear in-memory members to avoid TypeORM confusion
      project.members = [];

      await this.memberRepo.delete({ project: { id } });
      console.log(`Deleted old members for project ${id}`);

      for (const m of members) {
        const user = await this.userRepo.findOneBy({ id: m.employeeId });

        if (!user) {
          console.warn(`User ${m.employeeId} not found`);
          continue;
        }

        const newMember = this.memberRepo.create({
          project,
          employee: user,
          role: m.role,
        });

        await this.memberRepo.save(newMember);
        console.log(`Saved member ${user.id} with role ${m.role}`);
      }
    }

    Object.assign(project, data);

    // ✅ Si le statut est modifié manuellement, on l'applique directement
    if (dto.status) {
      project.status = dto.status;
      project.is_manual_status = true;
    }

    // 🔄 Reset du statut manuel
    if (dto.reset_manual_status) {
      project.is_manual_status = false;
    }

    // ⚠️ IMPORTANT: On supprime la propriété members de l'objet project avant le save
    // pour éviter que TypeORM n'écrase les membres qu'on vient de créer via memberRepo.
    delete (project as any).members;

    await this.projectRepo.save(project);

    // ⚠️ On recalcule le statut si on n'a pas forcé un statut manuel OU si on a demandé un reset
    if (!dto.status || dto.reset_manual_status) {
      await this.updateProjectStatus(project.id);
    }

    await this.assignMaintenancePermissionToMembers(id);

    const updatedProject = await this.findOne(id);

    // ✅ Send email to client
    if (updatedProject.client?.user?.email) {
      try {
        await this.mailService.sendProjectUpdatedEmail(
          updatedProject.client.user.email,
          {
            clientName: `${updatedProject.client.user.firstName} ${updatedProject.client.user.lastName}`,
            projectName: updatedProject.name,
            status: updatedProject.status,
            progress: updatedProject.progress,
            projectUrl: `${process.env.FRONTEND_URL}/app/project/show?id=${updatedProject.id}`,
          },
          updatedProject.client.user.roles,
        );
      } catch (error) {
        console.error('Failed to send project updated email:', error);
      }
    }

    return updatedProject;
  }

  // ------------------------------------------------------------
  // 🔹 DELETE PROJECT
  // ------------------------------------------------------------
  async remove(id: number): Promise<{ message: string }> {
    const project = await this.projectRepo.findOne({
      where: { id },
      relations: ['files', 'tasks', 'members', 'invoices'],
    });

    if (!project) throw new NotFoundException(`Projet #${id} introuvable`);

    // 1. Supprimer les fichiers liés
    if (project.files && project.files.length > 0) {
      await this.fileRepo.remove(project.files);
    }

    // 2. Supprimer les tâches liées
    // Note: Task entity has onDelete: CASCADE, but explicit deletion is safer if relation config changes
    if (project.tasks && project.tasks.length > 0) {
      await this.taskRepo.remove(project.tasks);
    }

    // 3. Supprimer les membres
    // Note: ProjectMember entity has onDelete: CASCADE
    if (project.members && project.members.length > 0) {
      await this.memberRepo.remove(project.members);
    }

    // 4. Supprimer les factures liées
    if (project.invoices && project.invoices.length > 0) {
      await this.invoiceRepo.remove(project.invoices);
    }

    // 5. Supprimer le paiement lié (Fetch manually to avoid relation error)
    const payment = await this.paymentRepo.findOne({
      where: { project: { id } },
    });

    if (payment) {
      await this.paymentRepo.remove(payment);
    }

    // 6. Supprimer le projet
    await this.projectRepo.remove(project);

    return {
      message: `Projet #${id} et toutes ses données associées ont été supprimés avec succès`,
    };
  }

  // ------------------------------------------------------------
  // 🔹 CALCUL AUTOMATIQUE DU STATUT
  // ------------------------------------------------------------
  async updateProjectStatus(projectId: number): Promise<void> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
    });

    if (!project) return;

    // 🛑 Si le statut est manuel, on ne touche à rien !
    if (project.is_manual_status) return;

    // ✅ Nouveau: Vérifier si le projet vient de passer à COMPLETED
    const wasCompleted = project.status === ProjectStatus.COMPLETED;

    // ✅ IMPORTANT: Reload tasks from database to get fresh data
    // This ensures we don't use stale cached task data
    const tasks = await this.taskRepo.find({
      where: { project: { id: projectId } },
    });

    console.log(
      `[Project #${projectId}] Reloaded ${tasks.length} tasks from database`,
    );

    // Cas 1: Aucune tâche → PLANNED
    if (tasks.length === 0) {
      project.status = ProjectStatus.PLANNED;
      console.log(`[Project #${projectId}] No tasks → PLANNED`);
    } else {
      const total = tasks.length;
      const doneCount = tasks.filter(
        (t) => t.status === TaskStatus.DONE,
      ).length;
      const inProgressCount = tasks.filter(
        (t) => t.status === TaskStatus.IN_PROGRESS,
      ).length;
      const blockedCount = tasks.filter(
        (t) => t.status === TaskStatus.BLOCKED,
      ).length;
      const todoCount = tasks.filter(
        (t) => t.status === TaskStatus.TODO,
      ).length;

      console.log(
        `[Project #${projectId}] Tasks: ${total} total, ${doneCount} done, ${inProgressCount} in progress, ${blockedCount} blocked, ${todoCount} todo`,
      );

      // Cas 2: Toutes les tâches sont terminées → COMPLETED
      if (doneCount === total) {
        project.status = ProjectStatus.COMPLETED;
        if (!project.real_end_date) {
          project.real_end_date = new Date();
        }
        console.log(`[Project #${projectId}] All tasks done → COMPLETED`);
      }
      // Cas 3: Au moins une tâche bloquée → ON_HOLD
      else if (blockedCount > 0) {
        project.status = ProjectStatus.ON_HOLD;
        console.log(`[Project #${projectId}] Has blocked tasks → ON_HOLD`);
      }
      // Cas 4: Au moins une tâche en cours → IN_PROGRESS
      else if (inProgressCount > 0 || doneCount > 0) {
        // Si on a des tâches en cours OU des tâches terminées (mais pas toutes), le projet est en cours
        project.status = ProjectStatus.IN_PROGRESS;
        console.log(
          `[Project #${projectId}] Has tasks in progress or some done → IN_PROGRESS`,
        );
      }
      // Cas 5: Toutes les tâches sont en TODO → PLANNED
      else {
        project.status = ProjectStatus.PLANNED;
        console.log(`[Project #${projectId}] All tasks are TODO → PLANNED`);
      }
    }

    const isNowCompleted = project.status === ProjectStatus.COMPLETED;

    await this.projectRepo.save(project);
    console.log(`[Project #${projectId}] Status updated to: ${project.status}`);

    // 🎯 Si le projet vient d'être complété, mettre à jour la fidélité et envoyer les emails
    if (isNowCompleted && !wasCompleted) {
      // 1. Mise à jour fidélité
      let loyaltyUpdate;
      try {
        loyaltyUpdate =
          await this.loyaltyService.updateClientLoyaltyOnProjectCompletion(
            projectId,
          );

        // Si le tier a changé, créer une notification interne
        if (loyaltyUpdate.tierUpgraded) {
          await this.notificationsService.createTierUpgradeNotification(
            project.client.id,
            loyaltyUpdate.oldTier,
            loyaltyUpdate.newTier,
          );
        }
      } catch (error) {
        console.error('[Project] Error updating loyalty:', error);
      }

      // 2. Email Projet Terminé
      if (project.client?.user?.email) {
        try {
          const duration = this.calculateDuration(
            project.start_date,
            project.real_end_date || new Date(),
          );
          await this.mailService.sendProjectCompletedEmail(
            project.client.user.email,
            {
              clientName: `${project.client.user.firstName} ${project.client.user.lastName}`,
              projectName: project.name,
              startDate: project.start_date.toLocaleDateString('fr-FR'),
              completedDate: (
                project.real_end_date || new Date()
              ).toLocaleDateString('fr-FR'),
              duration,
              projectUrl: `${process.env.FRONTEND_URL}/app/project/show?id=${project.id}`,
            },
            project.client.user.roles,
          );
        } catch (error) {
          console.error('Failed to send project completed email:', error);
        }
      }

      // 3. Email Récompense Fidélité (si tier amélioré)
      if (loyaltyUpdate?.tierUpgraded && project.client?.user?.email) {
        try {
          const newStatus = await this.loyaltyService.getLoyaltyStatus(
            project.client.id,
          );
          await this.mailService.sendLoyaltyRewardEmail(
            project.client.user.email,
            {
              clientName: `${project.client.user.firstName} ${project.client.user.lastName}`,
              oldTier: loyaltyUpdate.oldTier,
              newTier: loyaltyUpdate.newTier,
              reward: LOYALTY_RULES[loyaltyUpdate.newTier].reward,
              projectCount: newStatus.projectCount,
              nextTier: newStatus.nextTier,
              projectsToNextTier: newStatus.projectsToNextTier,
              loyaltyUrl: `${process.env.FRONTEND_URL}/app/loyalty/detail?clientId=${project.client.id}`,
            },
            project.client.user.roles,
          );
        } catch (error) {
          console.error('Failed to send loyalty reward email:', error);
        }
      }
    }
  }

  // ------------------------------------------------------------
  // 🔹 PAGINATION
  // ------------------------------------------------------------
  async findPaginated(
    query: FindProjectsQueryDto,
    userId: number,
  ): Promise<PaginatedResult<Project>> {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      clientId,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = query;

    const qb = this.projectRepo
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.client', 'client')
      .leftJoinAndSelect('client.user', 'clientUser')
      .leftJoinAndSelect('project.members', 'members')
      .leftJoinAndSelect('members.employee', 'employee');

    // 🔐 RBAC: Check user permissions
    console.log(`[ProjectsService] findPaginated called with query: ${JSON.stringify(query)}, userId: ${userId}`);

    if (!userId) {
      console.warn('[ProjectsService] findPaginated: userId is undefined or null');
      // Apply default filter to be safe
      qb.andWhere('project.name != :maintenanceName', {
        maintenanceName: 'Maintenance Sites Web',
      });
    }

    const user = userId
      ? await this.userRepo.findOne({
          where: { id: userId },
          relations: ['permissions'],
        })
      : null;

    if (user) {
      const isAdmin = user.roles.includes('admin' as any);
      const hasManagePermission = user.permissions?.some(
        (p) => p.slug === 'projects:manage',
      );

      console.log(`[ProjectsService] findPaginated internal: user found, isAdmin=${isAdmin}, hasManagePermission=${hasManagePermission}`);

      // If not admin and doesn't have manage permission, apply filters
      if (!isAdmin && !hasManagePermission) {
        const isClient =
          user.roles.includes('client_marketing' as any) ||
          user.roles.includes('client_ai' as any);

        if (isClient) {
          // Si c'est un client, il ne voit que ses projets
          qb.andWhere('clientUser.id = :userId', { userId });
        } else {
          // Sinon c'est un employé, il ne voit que les projets où il est membre
          // On utilise un subquery pour éviter les problèmes de jointures multiples
          qb.andWhere(
            'project.id IN (SELECT pm.projectId FROM project_members pm WHERE pm.employeeId = :userId)',
            { userId },
          );
        }

        // 🚫 Exclure le projet Maintenance pour les clients et employés
        qb.andWhere('project.name != :maintenanceName', {
          maintenanceName: 'Maintenance Sites Web',
        });
      }
    } else if (userId) {
      console.warn(`[ProjectsService] findPaginated: No user found for userId ${userId}`);
      // Safety: filter if userId was provided but no user found
      qb.andWhere('project.name != :maintenanceName', {
        maintenanceName: 'Maintenance Sites Web',
      });
    }

    if (search) {
      qb.andWhere(
        '(project.name LIKE :search OR project.description LIKE :search)',
        {
          search: `%${search}%`,
        },
      );
    }

    if (status) {
      qb.andWhere('project.status = :status', { status });
    }

    if (clientId) {
      qb.andWhere('client.id = :clientId', { clientId });
    }

    const [data, total] = await qb
      .orderBy(`project.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: data.map((p) => {
        p.progress = this.calculateProgress(p.tasks || []);
        return p;
      }),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ------------------------------------------------------------
  // 🔹 PAGINATION ADMIN (inclut Maintenance)
  // ------------------------------------------------------------
  async findPaginatedAdmin(
    query: FindProjectsQueryDto,
    userId: number,
  ): Promise<PaginatedResult<Project>> {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      clientId,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = query;

    const qb = this.projectRepo
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.client', 'client')
      .leftJoinAndSelect('client.user', 'clientUser')
      .leftJoinAndSelect('project.members', 'members')
      .leftJoinAndSelect('members.employee', 'employee');

    // 🔐 RBAC: Check user permissions (same as findPaginated but WITHOUT Maintenance exclusion)
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['permissions'],
    });

    if (user) {
      const isAdmin = user.roles.includes('admin' as any);
      const hasManagePermission = user.permissions?.some(
        (p) => p.slug === 'projects:manage',
      );

      // If not admin and doesn't have manage permission, apply filters
      if (!isAdmin && !hasManagePermission) {
        const isClient =
          user.roles.includes('client_marketing' as any) ||
          user.roles.includes('client_ai' as any);

        if (isClient) {
          // Si c'est un client, il ne voit que ses projets
          qb.andWhere('clientUser.id = :userId', { userId });
        } else {
          // Sinon c'est un employé, il ne voit que les projets où il est membre
          qb.andWhere(
            'project.id IN (SELECT pm.projectId FROM project_members pm WHERE pm.employeeId = :userId)',
            { userId },
          );
        }

        // ⚠️ NOTE: On N'exclut PAS le projet Maintenance ici (pour le backoffice)
      }
    }

    if (search) {
      qb.andWhere(
        '(project.name LIKE :search OR project.description LIKE :search)',
        {
          search: `%${search}%`,
        },
      );
    }

    if (status) {
      qb.andWhere('project.status = :status', { status });
    }

    if (clientId) {
      qb.andWhere('client.id = :clientId', { clientId });
    }

    const [data, total] = await qb
      .orderBy(`project.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: data.map((p) => {
        p.progress = this.calculateProgress(p.tasks || []);
        return p;
      }),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ------------------------------------------------------------
  // 🔹 SITES EN MAINTENANCE PAR CLIENT
  // ------------------------------------------------------------
  async getClientMaintenanceSites(clientId: number) {
    console.log(`[ProjectsService] getClientMaintenanceSites called for clientId: ${clientId}`);
    // 1. Trouver le projet "Maintenance Sites Web"
    const maintenanceProject = await this.projectRepo.findOne({
      where: { name: 'Maintenance Sites Web' },
      relations: ['websites'], // website.clientId column is enough, no need for full client relation
    });

    if (!maintenanceProject) {
      return {
        status: 'success',
        data: {
          sites: [],
          message: "Vous n'avez pas de sites en maintenance",
        },
      };
    }

    // 2. Filtrer les sites qui appartiennent au client
    console.log(`[ProjectsService] maintenanceProject websites count: ${maintenanceProject.websites?.length || 0}`);
    
    const clientSites = maintenanceProject.websites?.filter(
      (website) => {
        console.log(`[ProjectsService] Checking website ${website.id}: clientId=${website.clientId} vs requested=${clientId}`);
        return website.clientId === clientId;
      }
    ) || [];

    console.log(`[ProjectsService] Filtered clientSites count: ${clientSites.length}`);

    return {
      status: 'success',
      data: {
        sites: clientSites.map((site) => ({
          id: site.id,
          url: site.url,
          description: site.description,
          lastMaintenanceDate: site.lastMaintenanceDate,
        })),
        message: clientSites.length > 0
          ? `Vous avez ${clientSites.length} site(s) en maintenance`
          : "Vous n'avez pas de sites en maintenance",
      },
    };
  }

  // ------------------------------------------------------------
  // 🔹 HELPER: CALCUL DURATION
  // ------------------------------------------------------------
  private calculateDuration(startDate: Date, endDate?: Date): string {
    if (!endDate) return 'En cours';

    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 30) {
      return `${diffDays} jours`;
    } else {
      const months = Math.floor(diffDays / 30);
      const days = diffDays % 30;
      return days > 0 ? `${months} mois et ${days} jours` : `${months} mois`;
    }
  }

  // ------------------------------------------------------------
  // 🔹 HELPER: CALCUL PROGRESS
  // ------------------------------------------------------------
  // ------------------------------------------------------------
  // 🔹 WEBSITE MANAGEMENT
  // ------------------------------------------------------------
  async addWebsite(projectId: number, websiteId: number): Promise<Project> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['websites'],
    });
    if (!project)
      throw new NotFoundException(`Projet #${projectId} introuvable`);

    const website = await this.websiteRepo.findOneBy({ id: websiteId });
    if (!website)
      throw new NotFoundException(`Site web #${websiteId} introuvable`);

    // Check if already exists
    if (!project.websites.some((w) => w.id === website.id)) {
      project.websites.push(website);
      await this.projectRepo.save(project);
    }

    return this.findOne(projectId);
  }

  async removeWebsite(projectId: number, websiteId: number): Promise<Project> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['websites'],
    });
    if (!project)
      throw new NotFoundException(`Projet #${projectId} introuvable`);

    project.websites = project.websites.filter((w) => w.id !== websiteId);
    await this.projectRepo.save(project);

    return this.findOne(projectId);
  }

  async updateProjectSchedule(projectId: number, schedule: { recurrenceType: string; recurrenceInterval?: number; recurrenceDays?: string[] }): Promise<Project> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Projet introuvable');

    // Update project settings
    project.recurrenceType = schedule.recurrenceType;
    project.recurrenceInterval = schedule.recurrenceInterval;
    project.recurrenceDays = schedule.recurrenceDays;

    const savedProject = await this.projectRepo.save(project);

    // Update ALL existing tasks in the project
    const tasks = await this.taskRepo.find({
      where: { project: { id: project.id } },
    });

    for (const task of tasks) {
      task.recurrenceType = schedule.recurrenceType;
      task.recurrenceInterval = schedule.recurrenceInterval;
      task.recurrenceDays = schedule.recurrenceDays;
      await this.taskRepo.save(task);
    }

    return savedProject;
  }

  private calculateProgress(tasks: Task[]): number {
    if (!tasks || tasks.length === 0) return 0;
    const doneCount = tasks.filter((t) => t.status === TaskStatus.DONE).length;
    return Math.round((doneCount / tasks.length) * 100);
  }
}
