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
    return {
      userId: payload.sub,
      sub: payload.sub,
      email: payload.email,
      roles: payload.roles,
    };
  }
}
