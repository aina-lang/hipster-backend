import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KookUser } from '../entities/kook-user.entity';

@Injectable()
export class KookJwtStrategy extends PassportStrategy(Strategy, 'kook-jwt') {
  private readonly logger = new Logger(KookJwtStrategy.name);

  constructor(
    @InjectRepository(KookUser)
    private readonly userRepo: Repository<KookUser>,
  ) {
    const jwtSecret = 'kook-jwt-secret-change-in-production';
    Logger.log(`[KookJwtStrategy] secret used: "${jwtSecret}"`, KookJwtStrategy.name);
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: { sub: number; type: string }) {
    this.logger.log(`[KookJwtStrategy] validate payload: ${JSON.stringify(payload)}`);
    if (payload.type !== 'kook') {
      this.logger.warn(`[KookJwtStrategy] rejete: type=${payload.type} !== 'kook'`);
      throw new UnauthorizedException('Token invalide pour cette application');
    }

    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user) {
      this.logger.warn(`[KookJwtStrategy] utilisateur ${payload.sub} introuvable`);
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    this.logger.log(`[KookJwtStrategy] valide: user=${user.id} ${user.email}`);
    return user;
  }
}
