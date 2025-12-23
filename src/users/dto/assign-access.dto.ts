import { IsArray, IsOptional } from 'class-validator';

export class AssignAccessDto {
    @IsOptional()
    @IsArray()
    permissionIds?: number[];
}
