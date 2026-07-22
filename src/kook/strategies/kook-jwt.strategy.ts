import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KookUser } from '../entities/kook-user.entity';

@Injectable()
export class KookJwtStrategy extends PassportStrategy(Strategy, 'kook-jwt') {
  private readonly logger = new Logger(KookJwtStrategy.name);

  constructor(
    @InjectRepository(KookUser)
    private readonly userRepo: Repository<KookUser>,
    configService: ConfigService,
  ) {
    const jwtSecret = configService.get('KOOK_JWT_SECRET', 'kook-jwt-secret-change-in-production');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: { sub: number; type: string }) {
    if (payload.type !== 'kook') {
      throw new UnauthorizedException('Token invalide pour cette application');
    }

    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    return user;
  }
}
