import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as crypto from 'crypto';
import { NetflixVideo, NetflixVideoType, NetflixVideoVisibility } from './entities/netflix-video.entity';
import { NetflixAccessCode } from './entities/netflix-access-code.entity';
import { NetflixUser } from './entities/netflix-user.entity';
import { NetflixTelegramService } from './netflix-telegram.service';
import { CreateVideoDto } from './dto/create-video.dto';
import { UpdateVideoDto } from './dto/update-video.dto';

@Injectable()
export class NetflixContentService {
  private readonly logger = new Logger(NetflixContentService.name);

  constructor(
    @InjectRepository(NetflixVideo)
    private readonly videoRepo: Repository<NetflixVideo>,
    @InjectRepository(NetflixAccessCode)
    private readonly codeRepo: Repository<NetflixAccessCode>,
    private readonly telegram: NetflixTelegramService,
  ) {}

  async createVideo(
    creator: NetflixUser,
    dto: CreateVideoDto,
    file: Express.Multer.File,
  ): Promise<NetflixVideo> {
    const tg = await this.telegram.uploadVideo(file.path, file.originalname);

    const video = this.videoRepo.create({
      creator,
      title: dto.title,
      description: dto.description,
      videoType: dto.videoType || NetflixVideoType.FILM,
      seasonNumber: dto.seasonNumber,
      episodeNumber: dto.episodeNumber,
      seriesId: dto.seriesId,
      visibility: dto.visibility || NetflixVideoVisibility.PUBLIC,
      isPremium: dto.isPremium || false,
      telegramFileId: tg.fileId,
      telegramFilePath: tg.filePath,
      fileSize: tg.fileSize,
    });

    return this.videoRepo.save(video);
  }

  async findAll(query: {
    page?: number;
    limit?: number;
    type?: NetflixVideoType;
    visibility?: NetflixVideoVisibility;
    seriesId?: number;
  }): Promise<{ items: NetflixVideo[]; total: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const where: any = {};

    if (query.type) where.videoType = query.type;
    if (query.visibility) where.visibility = query.visibility;
    if (query.seriesId) where.seriesId = query.seriesId;

    const [items, total] = await this.videoRepo.findAndCount({
      where,
      relations: ['creator'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total };
  }

  async findOne(id: number, userId?: number): Promise<NetflixVideo> {
    const video = await this.videoRepo.findOne({
      where: { id },
      relations: ['creator', 'accessCodes'],
    });

    if (!video) throw new NotFoundException('Vidéo introuvable');

    if (video.visibility === NetflixVideoVisibility.PRIVATE && video.creator.id !== userId) {
      throw new ForbiddenException('Contenu privé. Code d\'accès requis.');
    }

    if (video.isPremium && video.creator.id !== userId) {
      throw new ForbiddenException('Contenu premium. Abonnement requis.');
    }

    video.viewsCount += 1;
    await this.videoRepo.save(video);

    return video;
  }

  async updateVideo(id: number, userId: number, dto: UpdateVideoDto): Promise<NetflixVideo> {
    const video = await this.videoRepo.findOne({ where: { id }, relations: ['creator'] });
    if (!video) throw new NotFoundException('Vidéo introuvable');
    if (video.creator.id !== userId) throw new ForbiddenException('Vous n\'êtes pas le créateur');

    Object.assign(video, dto);
    return this.videoRepo.save(video);
  }

  async deleteVideo(id: number, userId: number): Promise<void> {
    const video = await this.videoRepo.findOne({ where: { id }, relations: ['creator'] });
    if (!video) throw new NotFoundException('Vidéo introuvable');
    if (video.creator.id !== userId) throw new ForbiddenException('Vous n\'êtes pas le créateur');

    await this.videoRepo.remove(video);
  }

  async getMyVideos(userId: number): Promise<NetflixVideo[]> {
    return this.videoRepo.find({
      where: { creator: { id: userId } } as any,
      relations: ['accessCodes'],
      order: { createdAt: 'DESC' },
    });
  }

  async getStreamUrl(videoId: number): Promise<{ url: string }> {
    const video = await this.videoRepo.findOne({ where: { id: videoId } });
    if (!video) throw new NotFoundException('Vidéo introuvable');

    return { url: this.telegram.getStreamUrl(video.telegramFilePath) };
  }

  async generateCodes(videoId: number, count: number, userId: number): Promise<NetflixAccessCode[]> {
    const video = await this.videoRepo.findOne({ where: { id: videoId }, relations: ['creator'] });
    if (!video) throw new NotFoundException('Vidéo introuvable');
    if (video.creator.id !== userId) throw new ForbiddenException('Vous n\'êtes pas le créateur');

    const codes: NetflixAccessCode[] = [];

    for (let i = 0; i < count; i++) {
      const code = this.codeRepo.create({
        video,
        code: crypto.randomBytes(4).toString('hex').toUpperCase(),
      });
      codes.push(await this.codeRepo.save(code));
    }

    return codes;
  }

  async getCodes(videoId: number, userId: number): Promise<NetflixAccessCode[]> {
    const video = await this.videoRepo.findOne({ where: { id: videoId }, relations: ['creator'] });
    if (!video) throw new NotFoundException('Vidéo introuvable');
    if (video.creator.id !== userId) throw new ForbiddenException('Vous n\'êtes pas le créateur');

    return this.codeRepo.find({
      where: { video: { id: videoId } },
      order: { createdAt: 'DESC' },
    });
  }

  async verifyAccessCode(code: string): Promise<NetflixVideo> {
    const access = await this.codeRepo.findOne({
      where: { code, isUsed: false },
      relations: ['video'],
    });

    if (!access) throw new NotFoundException('Code invalide ou déjà utilisé');

    if (access.expiresAt && access.expiresAt < new Date()) {
      throw new ForbiddenException('Code expiré');
    }

    access.isUsed = true;
    access.usedAt = new Date();
    await this.codeRepo.save(access);

    return access.video;
  }

  async deleteCode(codeId: number, userId: number): Promise<void> {
    const code = await this.codeRepo.findOne({
      where: { id: codeId },
      relations: ['video', 'video.creator'],
    });

    if (!code) throw new NotFoundException('Code introuvable');
    if (code.video.creator.id !== userId) throw new ForbiddenException('Accès refusé');

    if (code.isUsed) throw new ForbiddenException('Impossible de supprimer un code utilisé');

    await this.codeRepo.remove(code);
  }
}
