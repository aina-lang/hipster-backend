import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KookUser } from './entities/kook-user.entity';
import { UpdateAccountDto } from './dto/update-account.dto';

@Injectable()
export class KookAccountService {
  constructor(
    @InjectRepository(KookUser)
    private readonly userRepo: Repository<KookUser>,
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
    return this.userRepo.save(user);
  }

  async uploadAvatar(userId: number, imageUrl: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    user.avatarUrl = imageUrl;
    return this.userRepo.save(user);
  }

  async uploadCover(userId: number, imageUrl: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    user.coverUrl = imageUrl;
    return this.userRepo.save(user);
  }

  async deleteAccount(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    await this.userRepo.remove(user);
    return { message: 'Compte supprimé avec succès' };
  }
}
