import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Stratégie JWT isolée pour Netflix (namespace `netflix`).
 * Les tokens émis portent `type: 'netflix'` pour ne jamais croiser
 * avec les tokens de l'app principale.
 */
@Injectable()
export class NetflixJwtStrategy extends PassportStrategy(Strategy, 'netflix-jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('NETFLIX_JWT_SECRET') || 'NETFLIX_DEFAULT_SECRET',
    });
  }

  async validate(payload: any) {
    if (payload.type !== 'netflix') {
      throw new UnauthorizedException('Jeton non valide pour Netflix.');
    }
    return {
      id: payload.sub,
      userId: payload.sub,
      sub: payload.sub,
      phone: payload.phone,
      userType: payload.userType,
    };
  }
}
