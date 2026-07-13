import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { deleteFile } from 'src/common/utils/file.utils';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Like, ILike } from 'typeorm';
import { ClientProfile } from './entities/client-profile.entity';
import { EmployeeProfile } from './entities/employee-profile.entity';
import { CreateClientProfileDto } from './dto/create-client-profile.dto';
import { UpdateClientProfileDto } from './dto/update-client-profile.dto';
import { CreateEmployeeProfileDto } from './dto/create-employee-profile.dto';
import { UpdateEmployeeProfileDto } from './dto/update-employee-profile.dto';
import { User } from 'src/users/entities/user.entity';
import * as bcrypt from 'bcrypt';
import { Role } from 'src/common/enums/role.enum';
import { ClientType } from 'src/common/enums/client.enum';
import { MailService } from 'src/mail/mail.service';

@Injectable()
export class ProfilesService {
  constructor(
    @InjectRepository(ClientProfile)
    private readonly clientRepo: Repository<ClientProfile>,

    @InjectRepository(EmployeeProfile)
    private readonly employeeRepo: Repository<EmployeeProfile>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,



    private readonly dataSource: DataSource,
    private readonly mailService: MailService,
  ) {}

  private readonly logger = new Logger(ProfilesService.name);

  // ----------------------------
  // CLIENT PROFILE
  // ----------------------------
  async createClientProfile(
    dto: CreateClientProfileDto,
  ): Promise<ClientProfile> {
    // Validate that either userId or userData is provided, not both
    if (dto.userId && dto.userData) {
      throw new BadRequestException(
        'Cannot provide both userId and userData. Choose one creation mode.',
      );
    }

    if (!dto.userId && !dto.userData) {
      throw new BadRequestException(
        'Either userId or userData must be provided.',
      );
    }

    // Use transaction to ensure atomicity
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let user: User | null = null;
      let passwordToSend: string | undefined;

      // Mode 1: Link to existing user
      if (dto.userId) {
        user = await queryRunner.manager.findOne(User, {
          where: { id: dto.userId },
          relations: ['clientProfile'],
        });

        if (!user) {
          throw new NotFoundException(`User with ID ${dto.userId} not found`);
        }

        if (user.clientProfile) {
          throw new ConflictException(
            `User with ID ${dto.userId} already has a client profile`,
          );
        }
      }
      // Mode 2: Create new user with profile
      else if (dto.userData) {
        // Check if email already exists
        const existingUser = await queryRunner.manager.findOne(User, {
          where: { email: dto.userData.email },
        });

        if (existingUser) {
          throw new ConflictException(
            `User with email ${dto.userData.email} already exists`,
          );
        }

        // Generate temp password if not provided
        let finalPassword = dto.userData.password;
        if (!finalPassword) {
          const randomDigits = Math.floor(1000 + Math.random() * 9000);
          const cleanLastName = dto.userData.lastName
            ? dto.userData.lastName.replace(/[^a-zA-Z0-9]/g, '')
            : 'User';
          finalPassword = `${cleanLastName}${randomDigits}!`;
        }
        passwordToSend = finalPassword;

        // Hash password
        const hashedPassword = await bcrypt.hash(finalPassword, 10);

        // Create new user
        user = queryRunner.manager.create(User, {
          ...dto.userData,
          password: hashedPassword,
          roles: dto.userData.roles || [Role.CLIENT_MARKETING],
        });

        user = await queryRunner.manager.save(User, user);
      }

      if (!user) {
        throw new BadRequestException('User creation or linking failed');
      }

      // Create client profile
      const { userId, userData, ...profileData } = dto;

      const clientProfile = queryRunner.manager.create(ClientProfile, {
        ...profileData,
        user,
      });

      const savedProfile = await queryRunner.manager.save(
        ClientProfile,
        clientProfile,
      );

      await queryRunner.commitTransaction();

      // ✅ Send welcome email if new user was created
      if (dto.userData && user.email) {
        try {
          await this.mailService.sendWelcomeEmail(user.email, {
            firstName: user.firstName,
            email: user.email,
            temporaryPassword:
              passwordToSend || "Veuillez contacter l'administrateur",
            dashboardUrl: `${process.env.FRONTEND_URL}/auth/login`,
          });
        } catch (error) {
          console.error('Failed to send welcome email to client:', error);
        }
      }

      // Return with relations loaded
      return this.findClientById(savedProfile.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAllClients(
    page: number = 1,
    limit: number = 10,
    clientType?: ClientType,
    search?: string,
  ): Promise<{
    data: ClientProfile[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const queryBuilder = this.clientRepo
      .createQueryBuilder('client')
      .leftJoinAndSelect('client.user', 'user')
      .leftJoinAndSelect('client.projects', 'projects')
      .leftJoinAndSelect('client.invoices', 'invoices')
      .leftJoinAndSelect('client.tickets', 'tickets')
      .leftJoinAndSelect('client.payments', 'payments')
      .leftJoinAndSelect('client.websites', 'websites');

    // Apply filters
    if (clientType) {
      queryBuilder.andWhere('client.clientType = :clientType', { clientType });
    }

    // 🚫 Exclude admins (users with role 'admin')
    queryBuilder.andWhere('user.roles NOT LIKE :adminRole', {
      adminRole: '%admin%',
    });

    if (search) {
      queryBuilder.andWhere(
        '(client.companyName LIKE :search OR user.firstName LIKE :search OR user.lastName LIKE :search OR user.email LIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    // Order by creation date
    queryBuilder.orderBy('client.id', 'DESC');

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findClientById(id: number): Promise<ClientProfile> {
    const profile = await this.clientRepo.findOne({
      where: { id },
      relations: ['user', 'projects', 'invoices', 'tickets', 'payments'],
    });
    if (!profile)
      throw new NotFoundException(`ClientProfile #${id} introuvable`);
    return profile;
  }

  async findClientByUserId(userId: number): Promise<ClientProfile> {
    const profile = await this.clientRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user', 'projects', 'invoices', 'tickets', 'payments'],
    });
    if (!profile)
      throw new NotFoundException(
        `ClientProfile for user #${userId} introuvable`,
      );
    return profile;
  }

  async updateClientProfile(
    id: number,
    dto: UpdateClientProfileDto,
  ): Promise<ClientProfile> {
    const profile = await this.findClientById(id);

    // Only update ClientProfile fields, not User fields
    Object.assign(profile, dto);

    await this.clientRepo.save(profile);

    // Return with fresh relations
    return this.findClientById(id);
  }

  async removeClientProfile(id: number): Promise<{ message: string }> {
    const profile = await this.findClientById(id);
    if (profile.user) {
      // Nettoyer les ManyToMany join tables avant la cascade DB
      await this.dataSource
        .createQueryBuilder()
        .delete()
        .from('chat_room_participants')
        .where('chat_room_id IN (SELECT id FROM chat_rooms WHERE client_profile_id = :id)', { id })
        .execute();
      await this.dataSource
        .createQueryBuilder()
        .delete()
        .from('chat_room_participants')
        .where('user_id = :uid', { uid: profile.user.id })
        .execute();
      await this.dataSource
        .createQueryBuilder()
        .delete()
        .from('task_assignees')
        .where('task_id IN (SELECT t.id FROM tasks t JOIN projects p ON p.id = t.projectId WHERE p.clientId = :id)', { id })
        .execute();
      // Supprimer l'utilisateur (cascade DB -> client_profile -> projets, factures, etc.)
      await this.userRepo.remove(profile.user);
    } else {
      await this.clientRepo.remove(profile);
    }
    return {
      message: `ClientProfile #${id} et utilisateur associé supprimés avec succès`,
    };
  }

  // ----------------------------
  // EMPLOYEE PROFILE
  // ----------------------------
  async createEmployeeProfile(
    dto: CreateEmployeeProfileDto,
    userId?: number,
  ): Promise<EmployeeProfile> {
    let user: User | null = null;

    if (userId) {
      user = await this.userRepo.findOne({
        where: { id: userId },
        relations: ['employeeProfile'],
      });

      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      if (user.employeeProfile) {
        throw new ConflictException(
          `User with ID ${userId} already has an employee profile`,
        );
      }
    }

    const profile = this.employeeRepo.create({
      ...dto,
      user: user || undefined,
    });
    return this.employeeRepo.save(profile);
  }

  async findAllEmployees(): Promise<EmployeeProfile[]> {
    return this.employeeRepo.find({
      relations: ['user', 'projectMemberships', 'chatMessages'],
    });
  }

  async findEmployeeById(id: number): Promise<EmployeeProfile> {
    const profile = await this.employeeRepo.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!profile)
      throw new NotFoundException(`EmployeeProfile #${id} introuvable`);
    return profile;
  }

  async updateEmployeeProfile(
    id: number,
    dto: UpdateEmployeeProfileDto,
  ): Promise<EmployeeProfile> {
    const profile = await this.findEmployeeById(id);
    Object.assign(profile, dto);
    return this.employeeRepo.save(profile);
  }

  async removeEmployeeProfile(id: number): Promise<{ message: string }> {
    const profile = await this.findEmployeeById(id);
    // ✅ Delete the User, which will cascade delete the EmployeeProfile
    if (profile.user) {
      await this.userRepo.remove(profile.user);
    } else {
      await this.employeeRepo.remove(profile);
    }
    return {
      message: `EmployeeProfile #${id} et utilisateur associé supprimés avec succès`,
    };
  }

  // 🔹 DELETE MULTIPLE (CLIENTS)
  async removeManyClientProfiles(ids: number[]): Promise<{ deleted: number; notFound: number[]; errors?: { id: number; error: string }[] }> {
    const notFound: number[] = [];
    const errors: { id: number; error: string }[] = [];
    let deleted = 0;
    for (const id of ids) {
      try {
        await this.removeClientProfile(id);
        deleted++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        if (msg.includes('introuvable')) {
          notFound.push(id);
        } else {
          this.logger.error(`Erreur suppression client #${id}: ${msg}`);
          errors.push({ id, error: msg });
        }
      }
    }
    return { deleted, notFound, errors: errors.length ? errors : undefined };
  }

  // 🔹 DELETE MULTIPLE (EMPLOYEES)
  async removeManyEmployeeProfiles(ids: number[]): Promise<{ deleted: number; notFound: number[]; errors?: { id: number; error: string }[] }> {
    const notFound: number[] = [];
    const errors: { id: number; error: string }[] = [];
    let deleted = 0;
    for (const id of ids) {
      try {
        await this.removeEmployeeProfile(id);
        deleted++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        if (msg.includes('introuvable')) {
          notFound.push(id);
        } else {
          this.logger.error(`Erreur suppression employé #${id}: ${msg}`);
          errors.push({ id, error: msg });
        }
      }
    }
    return { deleted, notFound, errors: errors.length ? errors : undefined };
  }

}

