import { IsString, IsNumber, IsOptional, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMessageDto {
  @ApiProperty({ example: 'Bonjour, avez-vous des questions sur le projet ?' })
  @IsString()
  content: string;

  @ApiProperty({ example: 'employee', enum: ['client', 'employee'] })
  @IsString()
  @IsIn(['client', 'employee'])
  senderType: 'client' | 'employee';

  @ApiProperty({ required: false })
  @IsOptional()
  attachments?: Record<string, any>;
}