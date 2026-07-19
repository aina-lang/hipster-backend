import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator @NetflixUser isolé : lit l'utilisateur Netflix depuis la requête.
 */
export const NetflixUser = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
