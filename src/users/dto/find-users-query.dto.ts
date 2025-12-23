import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { Role } from 'src/common/enums/role.enum';

const USER_SORTABLE_FIELDS = ['id', 'email', 'createdAt', 'isActive'] as const;

export class FindUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(Role, { message: 'role doit être une valeur valide de Role' })
  role?: Role;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;

  @IsOptional()
  @IsIn(USER_SORTABLE_FIELDS)
  sortBy?: (typeof USER_SORTABLE_FIELDS)[number];
}

export const USER_SORT_FIELDS = USER_SORTABLE_FIELDS;
