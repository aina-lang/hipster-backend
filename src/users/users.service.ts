import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, DataSource, In } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { EmployeeProfile } from 'src/profiles/entities/employee-profile.entity';
import { AiSubscriptionProfile } from 'src/profiles/entities/ai-subscription-profile.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignAccessDto } from './dto/assign-access.dto';
import { Role } from 'src/common/enums/role.enum';
import { FindUsersQueryDto } from './dto/find-users-query.dto';
import { PaginatedResult } from 'src/common/types/paginated-result.type';
import { Permission } from 'src/permissions/entities/permission.entity';
import { MailService } from 'src/mail/mail.service';
import { deleteFile } from 'src/common/utils/file.utils';
import {
  POSTE_PERMISSIONS,
  DEFAULT_EMPLOYEE_PERMISSIONS,
} from 'src/permissions/poste-permissions.config';

@Injectable()
export class UsersService {
  // Service methods for managing users and their profiles
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
    private readonly dataSource: DataSource,
    private readonly mailService: MailService,
  ) {}

  // --------------------------------------------------------
  // 🧩 CREATE USER (avec profils optionnels)
  // --------------------------------------------------------
  async create(dto: CreateUserDto): Promise<User & { generatedPassword?: string }> {
    const existing = await this.userRepo.findOne({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Cet email est déjà utilisé');

    // 🔐 Génération du mot de passe temporaire pour TOUS les nouveaux utilisateurs
    let finalPassword = dto.password;
    let temporaryPassword: string | null = null;

    // Si pas de mot de passe fourni OU si on veut forcer un mot de passe temporaire
    // Pour l'instant, on génère un mot de passe temporaire si aucun n'est fourni ou si c'est un client/employé
    if (!finalPassword) {
      const randomDigits = Math.floor(1000 + Math.random() * 9000); // 4 chiffres
      // Nettoyer le nom de famille (enlever espaces, accents, etc pour le mot de passe)
      const cleanLastName = dto.lastName
        ? dto.lastName.replace(/[^a-zA-Z0-9]/g, '')
        : 'User';
      // Format: Nom1234!
      temporaryPassword = `${cleanLastName}${randomDigits}!`;
      finalPassword = temporaryPassword;
      console.log(
        `[UsersService] Generated temporary password for ${dto.email}: ${temporaryPassword}`,
      );
    }

    const hashedPassword = await bcrypt.hash(finalPassword, 10);

    return await this.dataSource.transaction(async (manager) => {
      const userRoles = dto.roles || [Role.CLIENT_MARKETING];
      
      // 🤖 CUSTOM LOGIC: Admin and Employee MUST have CLIENT_AI role
      if (userRoles.includes(Role.ADMIN) || userRoles.includes(Role.EMPLOYEE)) {
        if (!userRoles.includes(Role.CLIENT_AI)) {
          userRoles.push(Role.CLIENT_AI);
        }
      }

      // 🚫 VALIDATION: Admin cannot have client profile
      if (userRoles.includes(Role.ADMIN) && dto.clientProfile) {
        throw new BadRequestException(
          'Un administrateur ne peut pas avoir de profil client',
        );
      }

      // Create the base user entity
      const user = manager.create(User, {
        email: dto.email,
        password: hashedPassword,
        roles: userRoles,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phones: dto.phones,
        contactEmail: dto.contactEmail,
        avatarUrl: dto.avatarUrl,
        isActive: dto.isActive ?? true,
        isEmailVerified: true, // Admin-created users are automatically verified
      });

      // Handle Client Profile
      if (dto.clientProfile) {
        user.clientProfile = manager.create(ClientProfile, dto.clientProfile);
      }

      // Handle Employee Profile
      if (dto.employeeProfile) {
        user.employeeProfile = manager.create(
          EmployeeProfile,
          dto.employeeProfile,
        );

        // 🔹 PERMISSIONS ASSIGNMENT
        // 1. Manual assignment (overrides everything)
        if (dto.permissions && dto.permissions.length > 0) {
           const permissions = await this.permissionRepo.findBy({
              slug: In(dto.permissions),
            });
            user.permissions = permissions;
             console.log(
              `[UsersService] Assigned ${permissions.length} manual permissions`,
            );
        } 
        // 2. Auto-assignment based on Poste (default behavior)
        else {
          const poste = user.employeeProfile.poste?.toLowerCase() || "";
          const permissionSlugs =
            POSTE_PERMISSIONS[poste] || DEFAULT_EMPLOYEE_PERMISSIONS;

          if (permissionSlugs.length > 0) {
            const permissions = await this.permissionRepo.findBy({
              slug: In(permissionSlugs),
            });
            user.permissions = permissions;
            console.log(
              `[UsersService] Assigned ${permissions.length} permissions (poste: '${poste || "none"}')`,
            );
          }
        }
      }

      // Handle AI Subscription Profile
      if (dto.aiProfile) {
        user.aiProfile = manager.create(AiSubscriptionProfile, dto.aiProfile);
      } else if (userRoles.includes(Role.ADMIN) || userRoles.includes(Role.EMPLOYEE)) {
        // Auto-create AI profile for staff if not provided
        user.aiProfile = manager.create(AiSubscriptionProfile, {
          accessLevel: 'FULL',
          credits: 999999,
          planType: 'enterprise',
          subscriptionStatus: 'active',
        } as any);
      }

      // Save user (cascades to profiles)
      const savedUser = await manager.save(user);

      // ✅ Send welcome email to ALL new users
      try {
        // Note: We need to use this.mailService inside the transaction, but mailService is injected in the service instance.
        // Since we are in an arrow function, 'this' refers to the service instance, so it should work.
        await this.mailService.sendWelcomeEmail(savedUser.email, {
          firstName: savedUser.firstName,
          email: savedUser.email,
          temporaryPassword:
            temporaryPassword || "Veuillez contacter l'administrateur",
          dashboardUrl: `${process.env.FRONTEND_URL}/auth/login`, // Updated to point to login page
        });
      } catch (error) {
        console.error('Failed to send welcome email:', error);
      }

      // Return both user and the plain text password (if generated)
      return {
        ...savedUser,
        generatedPassword: temporaryPassword || undefined,
      };
    });
  }

  // --------------------------------------------------------
  // 🔍 FIND ONE USER
  // --------------------------------------------------------
  async findOne(id: number): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id },
      relations: [
        'clientProfile',
        'employeeProfile',
        'aiProfile',
        'permissions',
      ],
    });

    if (!user) throw new NotFoundException(`Utilisateur #${id} introuvable`);
    return user;
  }

  // --------------------------------------------------------
  // 📋 FIND PAGINATED USERS
  // --------------------------------------------------------
  async findPaginated(
    query: FindUsersQueryDto,
  ): Promise<PaginatedResult<User>> {
    const { page = 1, limit = 10, search = '', role, isActive } = query;

    const qb: SelectQueryBuilder<User> = this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.clientProfile', 'clientProfile')
      .leftJoinAndSelect('user.employeeProfile', 'employeeProfile')
      .leftJoinAndSelect('user.aiProfile', 'aiProfile')
      .leftJoinAndSelect('user.permissions', 'permissions');

    // Filter by role
    if (role) {
      qb.andWhere('user.roles LIKE :role', { role: `%${role}%` });
    }

    // Filter by active status
    if (isActive !== undefined) {
      qb.andWhere('user.isActive = :isActive', { isActive });
    }

    // Search by name or email
    if (search) {
      qb.andWhere(
        '(LOWER(user.firstName) LIKE LOWER(:search) OR LOWER(user.lastName) LIKE LOWER(:search) OR LOWER(user.email) LIKE LOWER(:search))',
        { search: `%${search}%` },
      );
    }

    // Pagination
    const skip = (page - 1) * limit;
    qb.skip(skip).take(limit);

    // Order by creation date (newest first)
    qb.orderBy('user.createdAt', 'DESC');

    const [data, total] = await qb.getManyAndCount();

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

  // --------------------------------------------------------
  // ✏️ UPDATE USER
  // --------------------------------------------------------
  async update(id: number, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    // Check if email is being changed and if it's already taken
    if (dto.email && dto.email !== user.email) {
      const existing = await this.userRepo.findOne({
        where: { email: dto.email },
      });
      if (existing) {
        throw new ConflictException('Cet email est déjà utilisé');
      }
    }

    return await this.dataSource.transaction(async (manager) => {
      // 🚫 VALIDATION: If adding admin role, remove client profile
      if (dto.roles && dto.roles.includes(Role.ADMIN)) {
        if (user.clientProfile) {
          await manager.remove(user.clientProfile);
          user.clientProfile = undefined;
          console.log(
            `[UsersService] Removed client profile from user ${user.id} (promoted to admin)`,
          );
        }
        // Prevent adding client profile to admin
        if (dto.clientProfile) {
          throw new BadRequestException(
            'Un administrateur ne peut pas avoir de profil client',
          );
        }
      }

      // 🚫 VALIDATION: Prevent adding client profile to existing admin
      if (user.roles.includes(Role.ADMIN) && dto.clientProfile) {
        throw new BadRequestException(
          'Un administrateur ne peut pas avoir de profil client',
        );
      }

      // Update basic user fields
      if (dto.firstName) user.firstName = dto.firstName;
      if (dto.lastName) user.lastName = dto.lastName;
      if (dto.email) user.email = dto.email;
      if (dto.phones !== undefined) user.phones = dto.phones;
      if (dto.contactEmail !== undefined) user.contactEmail = dto.contactEmail;
      
      // ✅ Delete old avatar if a new one is being uploaded
      if (dto.avatarUrl && user.avatarUrl && dto.avatarUrl !== user.avatarUrl) {
        deleteFile(user.avatarUrl);
      }
      
      if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl;
      if (dto.roles) {
        user.roles = dto.roles;
        // 🤖 CUSTOM LOGIC: Enforce CLIENT_AI for staff on update
        if (user.roles.includes(Role.ADMIN) || user.roles.includes(Role.EMPLOYEE)) {
          if (!user.roles.includes(Role.CLIENT_AI)) {
            user.roles.push(Role.CLIENT_AI);
          }
        }
      }
      if (dto.isActive !== undefined) user.isActive = dto.isActive;

      // Hash password if provided
      if (dto.password) {
        user.password = await bcrypt.hash(dto.password, 10);
      }

      // Update Client Profile (only if not admin)
      if (dto.clientProfile && !user.roles.includes(Role.ADMIN)) {
        if (!user.clientProfile) {
          user.clientProfile = manager.create(ClientProfile, dto.clientProfile);
        } else {
          Object.assign(user.clientProfile, dto.clientProfile);
        }
      }

      // Update Employee Profile
      if (dto.employeeProfile) {
        let posteChanged = false;
        if (!user.employeeProfile) {
          user.employeeProfile = manager.create(
            EmployeeProfile,
            dto.employeeProfile,
          );
          posteChanged = true;
        } else {
          if (
            dto.employeeProfile.poste &&
            dto.employeeProfile.poste !== user.employeeProfile.poste
          ) {
            posteChanged = true;
          }
          Object.assign(user.employeeProfile, dto.employeeProfile);
        }

        // 🔹 PERMISSIONS ASSIGNMENT (Update)
        // 1. Manual assignment overrides everything
        if (dto.permissions && dto.permissions.length > 0) {
          const permissions = await this.permissionRepo.findBy({
            slug: In(dto.permissions),
          });
          user.permissions = permissions;
          console.log(
            `[UsersService] Updated permissions manually: ${permissions.length} assigned`,
          );
        }
        // 2. Auto-assignment only if NO manual override provided AND poste changed
        else if (posteChanged) {
          const poste = user.employeeProfile.poste?.toLowerCase() || "";
          const permissionSlugs =
            POSTE_PERMISSIONS[poste] || DEFAULT_EMPLOYEE_PERMISSIONS;

          if (permissionSlugs.length > 0) {
            const permissions = await this.permissionRepo.findBy({
              slug: In(permissionSlugs),
            });
            user.permissions = permissions;
            console.log(
              `[UsersService] Re-assigned ${permissions.length} permissions for new poste '${poste || "none"}'`,
            );
          }
        }
      }

      // Update AI Subscription Profile
      if (dto.aiProfile) {
        if (!user.aiProfile) {
          user.aiProfile = manager.create(AiSubscriptionProfile, dto.aiProfile);
        } else {
          Object.assign(user.aiProfile, dto.aiProfile);
        }
      } else if (user.roles.includes(Role.ADMIN) || user.roles.includes(Role.EMPLOYEE)) {
        // Ensure staff has an AI profile even if they didn't have one before
        if (!user.aiProfile) {
          user.aiProfile = manager.create(AiSubscriptionProfile, {
            accessLevel: 'FULL',
            credits: 999999,
            planType: 'enterprise',
            subscriptionStatus: 'active',
          } as any);
        }
      }

      // Save user (cascades to profiles)
      return await manager.save(user);
    });
  }

  // --------------------------------------------------------
  // ❌ DELETE USER
  // --------------------------------------------------------
  async remove(id: number): Promise<{ message: string }> {
    const user = await this.userRepo.findOneBy({ id });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    await this.userRepo.remove(user);
    return { message: `Utilisateur #${id} supprimé avec succès` };
  }

  // --------------------------------------------------------
  // 🔧 UTILS
  // --------------------------------------------------------
  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email } });
  }

  // --------------------------------------------------------
  // 🔐 ASSIGN PERMISSIONS
  // --------------------------------------------------------
  async assignAccess(userId: number, dto: AssignAccessDto): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['permissions'],
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    // Assign permissions
    if (dto.permissionIds !== undefined) {
      if (dto.permissionIds.length > 0) {
        const permissions = await this.permissionRepo.findBy({
          id: In(dto.permissionIds),
        });
        user.permissions = permissions;
      } else {
        user.permissions = [];
      }
    }

    return await this.userRepo.save(user);
  }

  // Get user with permissions
  async getUserAccess(userId: number): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['permissions'],
    });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    return user;
  }

  // --------------------------------------------------------
  // 🔐 REGENERATE PASSWORD
  // --------------------------------------------------------
  async regeneratePassword(
    id: number,
  ): Promise<{ message: string; password?: string }> {
    const user = await this.findOne(id);

    // 🔐 Génération du nouveau mot de passe temporaire
    const randomDigits = Math.floor(1000 + Math.random() * 9000); // 4 chiffres
    const cleanLastName = user.lastName
      ? user.lastName.replace(/[^a-zA-Z0-9]/g, '')
      : 'User';

    // Format: Nom1234!
    const temporaryPassword = `${cleanLastName}${randomDigits}!`;
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    // Update user password
    user.password = hashedPassword;
    await this.userRepo.save(user);

    console.log(
      `[UsersService] Regenerated password for ${user.email}: ${temporaryPassword}`,
    );

    // ✅ Send email to the user
    try {
      await this.mailService.sendNewPasswordEmail(user.email, {
        name: user.firstName || user.email,
        password: temporaryPassword,
        dashboardUrl: `${process.env.FRONTEND_URL}/auth/login`,
      } as any);
    } catch (error) {
      console.error('Failed to send password reset email:', error);
    }

    // Return the plain text password so the admin can show it
    return {
      message: 'Mot de passe régénéré avec succès',
      password: temporaryPassword,
    };
  }
}
