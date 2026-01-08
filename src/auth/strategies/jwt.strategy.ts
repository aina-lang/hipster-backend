import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

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
    console.log('🔑 JWT Strategy Validation:', payload);
    return {
      userId: payload.sub,
      sub: payload.sub,
      email: payload.email,
      roles: payload.roles,
    };
  }
}
