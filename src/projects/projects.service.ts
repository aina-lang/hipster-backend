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

import { User } from 'src/users/entities/user.entity';
import { File } from 'src/files/entities/file.entity';
import { Task, TaskStatus } from 'src/tasks/entities/task.entity';
import { FindProjectsQueryDto } from './dto/find-projects-query.dto';
import { PaginatedResult } from 'src/common/types/paginated-result.type';
import { MailService } from 'src/mail/mail.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { Role } from 'src/common/enums/role.enum';

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


    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ------------------------------------------------------------
  // 🔹 CREATE PROJECT
  // ------------------------------------------------------------
  async create(dto: CreateProjectDto, userId: number): Promise<Project> {
    const { clientId, members, fileIds, taskIds, ...data } = dto;

    // 🛑 Prevent manual creation of Maintenance Project
    if (
      data.name === 'Maintenance Sites Web' ||
      data.name?.startsWith('Maintenance Sites Web')
    ) {
      throw new BadRequestException(
        'Ce nom de projet est réservé. Veuillez utiliser le module Maintenance.',
      );
    }

    console.log('Creating project with members:', members);

    const currentUser = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['clientProfile'],
    });

    if (!currentUser) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    let clientUser: User | null = null;
    let client: ClientProfile | null = null;

    // 🔹 Déterminer si l'utilisateur est un client
    const isClient = currentUser.roles.includes('client_marketing' as any);

    // 🔹 Si aucun clientId fourni ET que currentUser est un client, auto-assigner
    if (!clientId && isClient) {
      // Auto-assign: le client crée son propre projet
      if (!currentUser.clientProfile) {
        throw new NotFoundException(
          'Profil client introuvable pour cet utilisateur',
        );
      }
      clientUser = currentUser;
      client = currentUser.clientProfile;
      console.log(
        `[Project Creation] Auto-assigned client: ${clientUser.firstName} ${clientUser.lastName} (ID: ${clientUser.id})`,
      );
    } else if (clientId) {
      // Admin ou autre utilisateur spécifie un clientId
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
      console.log(
        `[Project Creation] Assigned specified client: ${clientUser.firstName} ${clientUser.lastName} (ID: ${clientUser.id})`,
      );
    }

    // Determine default status: If admin/employee -> PLANNED, otherwise (client) -> PENDING
    // This ensures client-submitted projects require validation
    const isAdminOrEmployee =
      currentUser.roles.includes(Role.ADMIN) ||
      currentUser.roles.includes(Role.EMPLOYEE);

    const initialStatus = isAdminOrEmployee
      ? ProjectStatus.PLANNED
      : ProjectStatus.PENDING;

    // Créer le projet
    const project = this.projectRepo.create({
      ...data,
      status: initialStatus,
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


    // ✅ Send email to client (ONLY if client exists)
    if (clientUser && clientUser.email) {
      try {
        await this.mailService.sendProjectCreatedEmail(
          clientUser.email,
          {
            clientName: `${clientUser.firstName} ${clientUser.lastName}`,
            projectName: project.name,
            projectDescription: project.description || '',
            startDate: new Date(project.start_date).toLocaleDateString('fr-FR'),
            endDate: project.end_date
              ? new Date(project.end_date).toLocaleDateString('fr-FR')
              : 'Non définie',
            budget: project.budget,
            projectUrl: `${process.env.FRONTEND_URL}/app/project/show?id=${project.id}`,
          },
          clientUser.roles,
        );

        // ✅ Send in-app notification
        await this.notificationsService.sendProjectCreatedNotification(
          clientUser.id,
          project.id,
          project.name,
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

    // ✅ If created by a client (and not by an admin for a client), notify all admins
    if (
      clientUser &&
      clientUser.id === currentUser.id &&
      clientUser.roles?.includes('client_marketing' as any)
    ) {
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
            client.id,
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
  // 🔹 CREATE CLIENT PROJECT (Client Submission)
  // ------------------------------------------------------------
  async createClientProject(
    dto: CreateProjectDto,
    userId: number,
  ): Promise<Project> {
    const { members, fileIds, taskIds, ...data } = dto;

    // 🛑 Prevent manual creation of Maintenance Project
    if (
      data.name === 'Maintenance Sites Web' ||
      data.name?.startsWith('Maintenance Sites Web')
    ) {
      throw new BadRequestException(
        'Ce nom de projet est réservé. Veuillez utiliser le module Maintenance.',
      );
    }

    console.log('[Client Project] Creating project with members:', members);

    // 🔹 Get current user (must be a client)
    const currentUser = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['clientProfile'],
    });

    if (!currentUser) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    // 🔹 Verify user is a client
    const isClient = currentUser.roles.includes('client_marketing' as any);

    if (!isClient) {
      throw new BadRequestException(
        'Cet endpoint est réservé aux clients uniquement',
      );
    }

    if (!currentUser.clientProfile) {
      throw new NotFoundException(
        'Profil client introuvable pour cet utilisateur',
      );
    }

    const client = currentUser.clientProfile;
    console.log(
      `[Client Project] Auto-assigned client: ${currentUser.firstName} ${currentUser.lastName} (ID: ${currentUser.id})`,
    );

    // 🔹 Create project with PENDING status (always)
    const project = this.projectRepo.create({
      ...data,
      status: ProjectStatus.PENDING, // ✅ Always PENDING for client submissions
      createdBy: currentUser,
      updatedBy: currentUser,
      client: client,
    });

    await this.projectRepo.save(project);

    // ✅ Add members
    const memberUsers: { user: User; role: string }[] = [];
    if (members && members.length > 0) {
      for (const m of members) {
        const user = await this.userRepo.findOneBy({ id: m.employeeId });

        if (!user)
          throw new BadRequestException(
            `Utilisateur ${m.employeeId} introuvable`,
          );

        const membership = this.memberRepo.create({
          project,
          employee: user,
          role: m.role,
        });
        await this.memberRepo.save(membership);
        memberUsers.push({ user, role: m.role });
      }
    }

    // ✅ Link files
    if (fileIds?.length) {
      const files = await this.fileRepo.findBy({ id: In(fileIds) });
      project.files = files;
    }

    // ✅ Link tasks
    if (taskIds?.length) {
      const tasks = await this.taskRepo.findBy({ id: In(taskIds) });
      project.tasks = tasks;
    }

    await this.projectRepo.save(project);

    // ✅ Send email to client
    if (currentUser.email) {
      try {
        await this.mailService.sendProjectCreatedEmail(
          currentUser.email,
          {
            clientName: `${currentUser.firstName} ${currentUser.lastName}`,
            projectName: project.name,
            projectDescription: project.description || '',
            startDate: new Date(project.start_date).toLocaleDateString('fr-FR'),
            endDate: project.end_date
              ? new Date(project.end_date).toLocaleDateString('fr-FR')
              : 'Non définie',
            budget: project.budget,
            projectUrl: `${process.env.FRONTEND_URL}/app/project/show?id=${project.id}`,
          },
          currentUser.roles,
        );

        // ✅ Send in-app notification
        await this.notificationsService.sendProjectCreatedNotification(
          currentUser.id,
          project.id,
          project.name,
        );
      } catch (error) {
        console.error('Failed to send project created email to client:', error);
      }
    }

    // ✅ Send email to members
    if (memberUsers.length > 0) {
      const memberIds = memberUsers.map((m) => m.user.id);

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

    // ✅ Notify all admins about the client submission
    try {
      const admins = await this.userRepo.find({
        where: { roles: Like('%admin%') as any },
      });

      const adminIds = admins
        .filter((a) => a.roles.includes('admin' as any))
        .map((a) => a.id);

      if (adminIds.length > 0) {
        await this.notificationsService.createProjectSubmissionNotification(
          project.id,
          project.name,
          client.id, // ✅ Use client profile ID, not user ID
          adminIds,
        );

        for (const admin of admins) {
          if (admin.roles.includes('admin' as any) && admin.email) {
            await this.mailService.sendProjectSubmissionEmail(admin.email, {
              adminName: `${admin.firstName} ${admin.lastName}`,
              projectName: project.name,
              clientName: `${currentUser.firstName} ${currentUser.lastName}`,
              projectDescription: project.description,
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to send project submission notifications:', error);
    }

    return this.findOne(project.id);
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
    } else if (
      project.status === ProjectStatus.REFUSED &&
      currentUser &&
      currentUser.roles.includes('client_marketing' as any)
    ) {
      // 🔄 Si un client modifie un projet REFUSÉ, on le repasse en PENDING
      project.status = ProjectStatus.PENDING;
      project.is_manual_status = false;
      console.log(
        `Project #${id} status reset to PENDING due to client update`,
      );
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
  // 🔹 VALIDATE PROJECT (Admin Only)
  // ------------------------------------------------------------
  async validateProject(id: number, userId: number): Promise<Project> {
    const project = await this.findOne(id);
    if (!project) throw new NotFoundException('Projet introuvable');

    if (project.status !== ProjectStatus.PENDING) {
      throw new BadRequestException(
        "Ce projet n'est pas en attente de validation",
      );
    }

    const currentUser = await this.userRepo.findOneBy({ id: userId });
    if (!currentUser) throw new NotFoundException('Utilisateur introuvable');
    project.status = ProjectStatus.PLANNED;
    project.updatedBy = currentUser;
    project.is_manual_status = false;

    await this.projectRepo.save(project);

    // Notify Client
    if (project.client?.user?.email) {
      try {
        await this.mailService.sendProjectUpdatedEmail(
          project.client.user.email,
          {
            clientName: `${project.client.user.firstName} ${project.client.user.lastName}`,
            projectName: project.name,
            status: project.status,
            progress: 0,
            projectUrl: `${process.env.FRONTEND_URL}/app/project/show?id=${project.id}`,
          },
          project.client.user.roles,
        );
      } catch (error) {
        console.error('Failed to send project validation email:', error);
      }
    }

    return project;
  }

  // ------------------------------------------------------------
  // 🔹 REFUSE PROJECT (Admin Only)
  // ------------------------------------------------------------
  async refuseProject(
    id: number,
    userId: number,
    reason?: string,
  ): Promise<Project> {
    const project = await this.findOne(id);
    if (!project) throw new NotFoundException('Projet introuvable');

    if (project.status === ProjectStatus.CANCELED) {
      throw new BadRequestException('Ce projet est déjà annulé');
    }

    const currentUser = await this.userRepo.findOneBy({ id: userId });
    if (!currentUser) throw new NotFoundException('Utilisateur introuvable');
    project.status = ProjectStatus.REFUSED;
    project.updatedBy = currentUser;
    project.is_manual_status = true;

    await this.projectRepo.save(project);

    // Notify Client with refusal reason
    if (project.client?.user?.email) {
      try {
        // Send in-app notification with reason
        await this.notificationsService.createProjectRefusalNotification(
          project.client.user.id,
          project.id,
          project.name,
          reason || 'Aucun motif spécifié',
        );

        // Send email with reason
        await this.mailService.sendProjectRefusalEmail(
          project.client.user.email,
          {
            clientName: `${project.client.user.firstName} ${project.client.user.lastName}`,
            projectName: project.name,
            reason: reason || 'Aucun motif spécifié',
            projectUrl: `${process.env.FRONTEND_URL}/app/project/show?id=${project.id}`,
          },
          project.client.user.roles,
        );
      } catch (error) {
        console.error('Failed to send project refusal notification:', error);
      }
    }

    return project;
  }

  // ------------------------------------------------------------
  // 🔹 CANCEL PROJECT (Admin or Automatic)
  // ------------------------------------------------------------
  async cancelProject(id: number, userId?: number): Promise<Project> {
    const project = await this.findOne(id);
    if (!project) throw new NotFoundException('Projet introuvable');

    if (
      project.status === ProjectStatus.CANCELED ||
      project.status === ProjectStatus.COMPLETED
    ) {
      throw new BadRequestException('Ce projet est déjà annulé ou terminé');
    }

    if (userId) {
      const currentUser = await this.userRepo.findOneBy({ id: userId });
      if (!currentUser) throw new NotFoundException('Utilisateur introuvable');
      project.updatedBy = currentUser;
    }

    project.status = ProjectStatus.CANCELED;
    project.is_manual_status = true;

    await this.projectRepo.save(project);

    // Notify Client
    if (project.client?.user?.email) {
      try {
        await this.notificationsService.createProjectCancellationNotification(
          project.client.user.id,
          project.id,
          project.name,
        );

        await this.mailService.sendProjectCancelledEmail(
          project.client.user.email,
          {
            clientName: `${project.client.user.firstName} ${project.client.user.lastName}`,
            projectName: project.name,
            projectUrl: `${process.env.FRONTEND_URL}/app/project/show?id=${project.id}`,
          },
          project.client.user.roles,
        );
      } catch (error) {
        console.error(
          'Failed to send project cancellation notification:',
          error,
        );
      }
    }

    return project;
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

    // Cas 1: Aucune tâche → PLANNED (uniquement si le projet n'est pas en attente ou refusé)
    if (tasks.length === 0) {
      if (
        project.status !== ProjectStatus.PENDING &&
        project.status !== ProjectStatus.REFUSED &&
        project.status !== ProjectStatus.CANCELED
      ) {
        project.status = ProjectStatus.PLANNED;
        console.log(`[Project #${projectId}] No tasks → PLANNED`);
      }
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

    // 🎯 Si le projet vient d'être complété, envoyer l'email
    if (isNowCompleted && !wasCompleted) {
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
      .leftJoinAndSelect('members.employee', 'employee')
      .leftJoinAndSelect('project.tasks', 'tasks');

    // 🔐 RBAC: Check user permissions
    console.log(
      `[ProjectsService] findPaginated called with query: ${JSON.stringify(query)}, userId: ${userId}`,
    );

    if (!userId) {
      console.warn(
        '[ProjectsService] findPaginated: userId is undefined or null',
      );
      // Apply default filter to be safe
      qb.andWhere('project.name != :maintenanceName', {
        maintenanceName: 'Maintenance Sites Web',
      });
    }

    const user = userId
      ? await this.userRepo.findOne({ where: { id: userId } })
      : null;

    if (user) {
      const isAdmin = user.roles.includes('admin' as any);

      // If not admin, apply role-based filters
      if (!isAdmin) {
        const isClient =
          user.roles.includes('client_marketing' as any) ||
          user.roles.includes('client_ai' as any);

        if (isClient) {
          qb.andWhere('clientUser.id = :userId', { userId });
        } else {
          qb.andWhere(
            'project.id IN (SELECT pm.projectId FROM project_members pm WHERE pm.employeeId = :userId)',
            { userId },
          );
        }

        qb.andWhere('project.name != :maintenanceName', {
          maintenanceName: 'Maintenance Sites Web',
        });
      }
    } else if (userId) {
      console.warn(
        `[ProjectsService] findPaginated: No user found for userId ${userId}`,
      );
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
      .leftJoinAndSelect('members.employee', 'employee')
      .leftJoinAndSelect('project.tasks', 'tasks');

    // 🔐 RBAC: Check user permissions (same as findPaginated but WITHOUT Maintenance exclusion)
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (user) {
      const isAdmin = user.roles.includes('admin' as any);

      if (!isAdmin) {
        const isClient =
          user.roles.includes('client_marketing' as any) ||
          user.roles.includes('client_ai' as any);

        if (isClient) {
          qb.andWhere('clientUser.id = :userId', { userId });
        } else {
          qb.andWhere(
            'project.id IN (SELECT pm.projectId FROM project_members pm WHERE pm.employeeId = :userId)',
            { userId },
          );
        }
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
    console.log(
      `[ProjectsService] getClientMaintenanceSites called for clientId: ${clientId}`,
    );

    // On récupère tous les sites du client.
    // Pour l'app mobile, ces sites sont considérés comme étant "en maintenance".
    const clientSites = await this.websiteRepo.find({
      where: { clientId },
      order: { id: 'DESC' },
    });

    console.log(
      `[ProjectsService] Found ${clientSites.length} maintenance sites for client ${clientId}`,
    );

    return {
      sites: clientSites.map((site) => ({
        id: site.id,
        url: site.url,
        description: site.description,
        lastMaintenanceDate: site.lastMaintenanceDate,
      })),
      message:
        clientSites.length > 0
          ? `Vous avez ${clientSites.length} site(s) en maintenance`
          : "Vous n'avez pas de sites en maintenance",
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

  async updateProjectSchedule(
    projectId: number,
    schedule: {
      recurrenceType: string;
      recurrenceInterval?: number;
      recurrenceDays?: string[];
    },
  ): Promise<Project> {
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

  async generatePdf(id: number): Promise<Buffer> {
    const project = await this.projectRepo.findOne({
      where: { id },
      relations: [
        'client',
        'client.user',
        'tasks',
        'members',
        'members.employee',
      ],
    });
    if (!project) throw new NotFoundException('Project not found');

    const puppeteer = require('puppeteer');

    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.CHROME_BIN || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
      ],
    });

    try {
      const page = await browser.newPage();
      const htmlContent = this.getProjectHtml(project);

      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0',
        timeout: 60000,
      });

      await page.emulateMediaType('screen');

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px',
        },
      });

      await browser.close();
      return Buffer.from(pdfBuffer);
    } catch (error) {
      console.error('Project PDF generation error:', error);
      if (browser) await browser.close();
      throw error;
    }
  }

  private getProjectHtml(project: Project): string {
    const progress = this.calculateProgress(project.tasks || []);
    const formatDate = (date: Date | string | undefined) => {
      if (!date) return 'N/A';
      return new Date(date).toLocaleDateString('fr-FR');
    };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: 'Helvetica', sans-serif; color: #333; line-height: 1.5; font-size: 14px; margin: 0; padding: 20px; }
          .header { border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
          .logo { font-size: 24px; font-weight: bold; text-transform: uppercase; }
          .project-title { font-size: 20px; font-weight: bold; margin: 0; }
          .status { background: #000; color: #fff; padding: 5px 10px; border-radius: 4px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
          
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
          .info-box { background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #eee; }
          .info-label { font-size: 11px; text-transform: uppercase; color: #6c757d; font-weight: bold; margin-bottom: 5px; }
          
          .progress-section { margin-bottom: 30px; }
          .progress-bar-bg { background: #eee; height: 12px; border-radius: 6px; overflow: hidden; margin-top: 10px; }
          .progress-bar-fill { background: #000; height: 100%; width: ${progress}%; }
          
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { text-align: left; padding: 10px; background: #eee; font-size: 12px; text-transform: uppercase; }
          td { padding: 10px; border-bottom: 1px solid #eee; font-size: 13px; }
          
          .task-status { font-weight: bold; font-size: 11px; text-transform: uppercase; }
          .task-status.done { color: green; }
          .task-status.todo { color: #666; }
          .task-status.in_progress { color: orange; }

          .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">HIPSTER MARKETING</div>
          <div class="status">${project.status}</div>
        </div>

        <h1 class="project-title">${project.name}</h1>
        <p style="color: #666;">Rapport de synthèse généré le ${new Date().toLocaleDateString('fr-FR')}</p>

        <div class="info-grid">
          <div class="info-box">
            <div class="info-label">Client</div>
            <strong>${project.client?.companyName || (project.client?.user ? project.client.user.firstName + ' ' + project.client.user.lastName : 'N/A')}</strong><br>
            ${project.client?.user?.email || ''}
          </div>
          <div class="info-box">
            <div class="info-label">Dates</div>
            Début: ${formatDate(project.start_date)}<br>
            Fin prévue: ${formatDate(project.end_date)}
          </div>
        </div>

        <div class="progress-section">
          <div style="display: flex; justify-content: space-between; font-weight: bold;">
            <span>Progression globale</span>
            <span>${progress}%</span>
          </div>
          <div class="progress-bar-bg">
            <div class="progress-bar-fill"></div>
          </div>
        </div>

        <h3>Liste des tâches</h3>
        <table>
          <thead>
            <tr>
              <th>Titre</th>
              <th>Status</th>
              <th>Échéance</th>
            </tr>
          </thead>
          <tbody>
            ${(project.tasks || [])
              .map(
                (task) => `
              <tr>
                <td>${task.title}</td>
                <td class="task-status ${task.status}">${task.status}</td>
                <td>${formatDate(task.dueDate)}</td>
              </tr>
            `,
              )
              .join('')}
          </tbody>
        </table>

        <div class="footer">
          Hipster Marketing - Rapport de projet confidentiel
        </div>
      </body>
      </html>
    `;
  }
}
