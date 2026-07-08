import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: 'MON KEY', // TODO: Use environment variable
    });
  }

  async validate(payload: any) {
    if (payload.type === 'ai') {
      throw new UnauthorizedException(
        'Ce jeton est réservé à la plateforme IA.',
      );
    }
    console.log('🔑 JWT Strategy Validation:', payload);
    return {
      id: payload.sub,
      userId: payload.sub,
      sub: payload.sub,
      email: payload.email,
      roles: payload.roles,
    };
  }
}
