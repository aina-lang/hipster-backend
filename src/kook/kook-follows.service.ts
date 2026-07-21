import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Follow } from './entities/follow.entity';
import { KookUser } from './entities/kook-user.entity';

@Injectable()
export class KookFollowsService {
  constructor(
    @InjectRepository(Follow)
    private readonly repo: Repository<Follow>,
  ) {}

  async findFollowers(userId: number) {
    return this.repo.find({
      where: { following: { id: userId } },
      relations: ['follower'],
      order: { createdAt: 'DESC' },
    });
  }

  async findFollowing(userId: number) {
    return this.repo.find({
      where: { follower: { id: userId } },
      relations: ['following'],
      order: { createdAt: 'DESC' },
    });
  }

  async follow(followerId: number, followingId: number) {
    if (followerId === followingId) {
      throw new NotFoundException('Vous ne pouvez pas vous suivre vous-même');
    }

    const existing = await this.repo.findOne({
      where: { follower: { id: followerId }, following: { id: followingId } },
    });
    if (existing) throw new NotFoundException('Vous suivez déjà cet utilisateur');

    const follow = this.repo.create({
      follower: { id: followerId } as any,
      following: { id: followingId } as any,
    });
    return this.repo.save(follow);
  }

  async unfollow(followerId: number, followingId: number) {
    const follow = await this.repo.findOne({
      where: { follower: { id: followerId }, following: { id: followingId } },
    });
    if (!follow) throw new NotFoundException('Vous ne suivez pas cet utilisateur');

    await this.repo.remove(follow);
    return { message: 'Désabonné avec succès' };
  }
}
