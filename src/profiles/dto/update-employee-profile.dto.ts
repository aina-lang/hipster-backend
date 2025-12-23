import { PartialType } from '@nestjs/mapped-types';
import { CreateEmployeeProfileDto } from './create-employee-profile.dto';

export class UpdateEmployeeProfileDto extends PartialType(
  CreateEmployeeProfileDto,
) {}
