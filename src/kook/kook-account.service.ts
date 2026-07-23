import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KookUser } from './entities/kook-user.entity';
import { UpdateAccountDto } from './dto/update-account.dto';
import { KookNotificationGateway } from './gateways/kook-notification.gateway';

@Injectable()
export class KookAccountService {
  constructor(
    @InjectRepository(KookUser)
    private readonly userRepo: Repository<KookUser>,
    private readonly notifGateway: KookNotificationGateway,
  ) {}

  async getProfile(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }

  async updateProfile(userId: number, dto: UpdateAccountDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    if (dto.pseudo && dto.pseudo !== user.pseudo) {
      const existing = await this.userRepo.findOne({ where: { pseudo: dto.pseudo } });
      if (existing) throw new ConflictException('Ce pseudo est déjà utilisé');
    }

    Object.assign(user, dto);
    const saved = await this.userRepo.save(user);
    this.notifGateway.broadcastUserUpdated({ id: saved.id, pseudo: saved.pseudo, avatarUrl: saved.avatarUrl, coverUrl: saved.coverUrl });
    return saved;
  }

  async uploadAvatar(userId: number, imageUrl: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    user.avatarUrl = imageUrl;
    const saved = await this.userRepo.save(user);
    this.notifGateway.broadcastUserUpdated({ id: saved.id, avatarUrl: saved.avatarUrl });
    return saved;
  }

  async uploadCover(userId: number, imageUrl: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    user.coverUrl = imageUrl;
    const saved = await this.userRepo.save(user);
    this.notifGateway.broadcastUserUpdated({ id: saved.id, coverUrl: saved.coverUrl });
    return saved;
  }

  async deleteAccount(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    await this.userRepo.remove(user);
    return { message: 'Compte supprimé avec succès' };
  }
}
