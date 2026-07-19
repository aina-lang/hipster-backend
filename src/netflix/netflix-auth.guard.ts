import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard as PassportAuthGuard } from '@nestjs/passport';

/**
 * Guard JWT isolé Netflix : utilise uniquement la stratégie 'netflix-jwt'.
 */
@Injectable()
export class NetflixAuthGuard extends PassportAuthGuard(['netflix-jwt']) {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, _info: any) {
    if (err || !user) {
      throw err || new (require('@nestjs/common').UnauthorizedException)();
    }
    return user;
  }
}
