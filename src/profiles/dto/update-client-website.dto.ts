import { PartialType } from '@nestjs/mapped-types';
import { CreateClientWebsiteDto } from './create-client-website.dto';

export class UpdateClientWebsiteDto extends PartialType(
  CreateClientWebsiteDto,
) {}
