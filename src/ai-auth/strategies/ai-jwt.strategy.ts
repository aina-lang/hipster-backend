import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class AiJwtStrategy extends PassportStrategy(Strategy, 'jwt-ai') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'secretKey',
    });
  }

  async validate(payload: any) {
    if (payload.type !== 'ai') {
      throw new UnauthorizedException(
        "Ce jeton n'est pas valide pour la plateforme IA.",
      );
    }
    return {
      userId: payload.sub,
      sub: payload.sub,
      email: payload.email,
      roles: payload.roles,
      type: payload.type,
    };
  }
}
