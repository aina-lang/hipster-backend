import { PartialType } from '@nestjs/mapped-types';
import { CreateIaClientProfileDto } from './create-ia-client-profile.dto';

export class UpdateAiProfileDto extends PartialType(CreateIaClientProfileDto) {}
