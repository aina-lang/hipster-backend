import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { File } from './entities/file.entity';
import { CreateFileDto } from './dto/create-file.dto';
import { UpdateFileDto } from './dto/update-file.dto';
import { User } from 'src/users/entities/user.entity';
import { Project } from 'src/projects/entities/project.entity';
import { Ticket } from 'src/tickets/entities/ticket.entity';
import { QueryFilesDto } from './dto/query-files.dto';
import { PaginatedResult } from 'src/common/types/paginated-result.type';
import { deleteFile } from 'src/common/utils/file.utils';

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(File)
    private readonly fileRepo: Repository<File>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,

    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,
  ) {}

  // ----------------------------
  // 🔹 CREATE
  // ----------------------------
  async create(dto: CreateFileDto): Promise<File> {
    const { uploadedById, projectId, ticketId } = dto;

    // Vérification : uploader (obligatoire)
    let uploadedBy: User | null = null;
    if (uploadedById) {
      uploadedBy = await this.userRepo.findOneBy({ id: uploadedById });
      if (!uploadedBy)
        throw new NotFoundException(`Utilisateur #${uploadedById} introuvable`);
    }

    // Vérification : project (optionnel)
    let project: Project | null = null;
    if (projectId) {
      project = await this.projectRepo.findOneBy({ id: projectId });
      if (!project)
        throw new NotFoundException(`Projet #${projectId} introuvable`);
    }

    // Vérification : ticket (optionnel)
    let ticket: Ticket | null = null;
    if (ticketId) {
      ticket = await this.ticketRepo.findOneBy({ id: ticketId });
      if (!ticket)
        throw new NotFoundException(`Ticket #${ticketId} introuvable`);
    }

    const file = this.fileRepo.create({
      ...dto,
      uploadedBy: uploadedBy ? { id: uploadedBy.id } : undefined,
      project: project ? { id: project.id } : undefined,
      ticket: ticket ? { id: ticket.id } : undefined,
    });

    return await this.fileRepo.save(file);
  }

  // ----------------------------
  // 🔹 FIND ALL
  // ----------------------------
  async findAll(): Promise<File[]> {
    const result = await this.findPaginated();
    return result.data;
  }

  async findPaginated(
    query: QueryFilesDto = new QueryFilesDto(),
  ): Promise<PaginatedResult<File>> {
    const {
      page = 1,
      limit = 25,
      search,
      sortBy = 'uploadedAt',
      sortOrder = 'DESC',
      projectId,
      ticketId,
      taskId,
      uploaderId,
    } = query;

    const qb = this.fileRepo
      .createQueryBuilder('file')
      .leftJoinAndSelect('file.uploadedBy', 'uploadedBy')
      .leftJoinAndSelect('file.project', 'project')
      .leftJoinAndSelect('file.ticket', 'ticket')
      .leftJoinAndSelect('file.task', 'task');

    if (search) {
      qb.andWhere('(file.url LIKE :search OR file.type LIKE :search)', {
        search: `%${search}%`,
      });
    }

    if (projectId) qb.andWhere('project.id = :projectId', { projectId });
    if (ticketId) qb.andWhere('ticket.id = :ticketId', { ticketId });
    if (taskId) qb.andWhere('task.id = :taskId', { taskId });
    if (uploaderId) qb.andWhere('uploadedBy.id = :uploaderId', { uploaderId });

    const [data, total] = await qb
      .orderBy(`file.${sortBy}`, sortOrder)
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

  // ----------------------------
  // 🔹 FIND ONE
  // ----------------------------
  async findOne(id: number): Promise<File> {
    const file = await this.fileRepo.findOne({
      where: { id },
      relations: ['uploadedBy', 'project', 'ticket'],
    });

    if (!file) {
      throw new NotFoundException(`Fichier #${id} introuvable`);
    }

    return file;
  }

  // ----------------------------
  // 🔹 UPDATE
  // ----------------------------
  async update(id: number, dto: UpdateFileDto): Promise<File> {
    const file = await this.fileRepo.findOneBy({ id });
    if (!file) throw new NotFoundException(`Fichier #${id} introuvable`);

    // ✅ Delete old file if URL is being updated
    if (dto.url && file.url && dto.url !== file.url) {
      deleteFile(file.url);
    }

    Object.assign(file, dto);
    return this.fileRepo.save(file);
  }

  // ----------------------------
  // 🔹 REMOVE
  // ----------------------------
  async remove(id: number): Promise<{ message: string }> {
    const file = await this.fileRepo.findOneBy({ id });
    if (!file) throw new NotFoundException(`Fichier #${id} introuvable`);

    // ✅ Delete physical file before removing from DB
    deleteFile(file.url);

    await this.fileRepo.remove(file);
    return { message: `Fichier #${id} supprimé avec succès` };
  }

  // 🔹 DELETE MULTIPLE
  async removeMany(ids: number[]): Promise<{ deleted: number; notFound: number[] }> {
    const files = await this.fileRepo.find({ where: { id: In(ids) } });
    const foundIds = files.map((f) => f.id);
    const notFound = ids.filter((id) => !foundIds.includes(id));
    for (const file of files) {
      deleteFile(file.url);
    }
    if (files.length) await this.fileRepo.remove(files);
    return { deleted: files.length, notFound };
  }

  // ----------------------------
  // 🔹 FIND BY PROJECT
  // ----------------------------
  async findByProject(projectId: number): Promise<File[]> {
    return this.fileRepo.find({
      where: { project: { id: projectId } },
      relations: ['uploadedBy', 'project'],
      order: { uploadedAt: 'DESC' },
    });
  }

  // ----------------------------
  // 🔹 FIND BY TICKET
  // ----------------------------
  async findByTicket(ticketId: number): Promise<File[]> {
    return this.fileRepo.find({
      where: { ticket: { id: ticketId } },
      relations: ['uploadedBy', 'ticket'],
      order: { uploadedAt: 'DESC' },
    });
  }

  // ----------------------------
  // 🔹 FIND BY USER (Uploader)
  // ----------------------------
  async findByUser(userId: number): Promise<File[]> {
    return this.fileRepo.find({
      where: { uploadedBy: { id: userId } },
      relations: ['uploadedBy', 'project', 'ticket'],
      order: { uploadedAt: 'DESC' },
    });
  }
}
