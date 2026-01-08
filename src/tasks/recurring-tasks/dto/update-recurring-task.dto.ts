import { PartialType } from '@nestjs/mapped-types';
import { CreateRecurringTaskDto } from './create-recurring-task.dto';

export class UpdateRecurringTaskDto extends PartialType(
  CreateRecurringTaskDto,
) {}
