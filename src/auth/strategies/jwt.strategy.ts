import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || 'change-me-jwt-secret',
    });
  }

  async validate(payload: any) {
    if (payload.type === 'ai') {
      throw new UnauthorizedException(
        'Ce jeton est réservé à la plateforme IA.',
      );
    }
    console.log('JWT Strategy Validation:', payload);
    return {
      id: payload.sub,
      userId: payload.sub,
      sub: payload.sub,
      email: payload.email,
      roles: payload.roles,
    };
  }
}
