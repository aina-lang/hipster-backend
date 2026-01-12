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
import { AiSubscriptionProfile } from './entities/ai-subscription-profile.entity';
import { CreateClientProfileDto } from './dto/create-client-profile.dto';
import { UpdateClientProfileDto } from './dto/update-client-profile.dto';
import { CreateEmployeeProfileDto } from './dto/create-employee-profile.dto';
import { UpdateEmployeeProfileDto } from './dto/update-employee-profile.dto';
import { UpdateAiProfileDto } from './dto/update-ai-profile.dto';
import { CreateIaClientProfileDto } from './dto/create-ia-client-profile.dto';
import { User } from 'src/users/entities/user.entity';
import { AiUser } from 'src/ai/entities/ai-user.entity';
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

    @InjectRepository(AiSubscriptionProfile)
    private readonly aiProfileRepo: Repository<AiSubscriptionProfile>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(AiUser)
    private readonly aiUserRepo: Repository<AiUser>,
 
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
    // ✅ Delete the User, which will cascade delete the ClientProfile and all related data
    if (profile.user) {
      await this.userRepo.remove(profile.user);
    } else {
      // Fallback if no user (should not happen given logic)
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
      relations: ['user', 'tasks', 'projectMemberships', 'chatMessages'],
    });
  }

  async findEmployeeById(id: number): Promise<EmployeeProfile> {
    const profile = await this.employeeRepo.findOne({
      where: { id },
      relations: ['user', 'tasks'],
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

  // ----------------------------
  // AI SUBSCRIPTION PROFILE
  // ----------------------------
  async createAiProfile(
    dto: CreateIaClientProfileDto,
  ): Promise<AiSubscriptionProfile> {
    const { userId, ...profileData } = dto;
    let aiUser: AiUser | null = null;

    if (userId) {
      aiUser = await this.aiUserRepo.findOne({
        where: { id: userId },
        relations: ['aiProfile'],
      });

      if (!aiUser) {
        throw new NotFoundException(`AiUser with ID ${userId} not found`);
      }

      if (aiUser.aiProfile) {
        throw new ConflictException(
          `AiUser with ID ${userId} already has an AI profile`,
        );
      }
    }

    const profile = this.aiProfileRepo.create({
      ...profileData,
      aiUser: aiUser || undefined,
    });
    return this.aiProfileRepo.save(profile);
  }

  async findAllAiProfiles(): Promise<AiSubscriptionProfile[]> {
    return this.aiProfileRepo.find({
      relations: ['aiUser', 'subscriptions', 'usageLogs', 'payments'],
    });
  }

  async findAiProfileById(id: number): Promise<AiSubscriptionProfile> {
    const profile = await this.aiProfileRepo.findOne({
      where: { id },
      relations: ['aiUser', 'subscriptions'],
    });
    if (!profile)
      throw new NotFoundException(`AiSubscriptionProfile #${id} introuvable`);
    return profile;
  }

  async updateAiProfile(
    id: number,
    dto: UpdateAiProfileDto,
  ): Promise<AiSubscriptionProfile> {
    this.logger.log(`Updating AI Profile #${id} with data: ${JSON.stringify(dto)}`);
    const profile = await this.findAiProfileById(id);

    // ✅ Delete old logo if a new one is being uploaded
    if (dto.logoUrl && profile.logoUrl && dto.logoUrl !== profile.logoUrl) {
      deleteFile(profile.logoUrl);
    }

    Object.assign(profile, dto);
    const saved = await this.aiProfileRepo.save(profile);
    this.logger.log(`AI Profile #${id} updated successfully`);
    return saved;
  }

  async removeAiProfile(id: number): Promise<{ message: string }> {
    const profile = await this.findAiProfileById(id);
    await this.aiProfileRepo.remove(profile);
    return { message: `AiSubscriptionProfile #${id} supprimé avec succès` };
  }
}
