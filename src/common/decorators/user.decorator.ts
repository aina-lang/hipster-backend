import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { User as UserEntity } from 'src/users/entities/user.entity';

export const User = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user?: any }>();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);
