import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateChatDto {
  @ApiProperty({ example: 'Projet Site Vitrine', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 5 })
  @IsNumber()
  clientProfileId: number;

  @ApiProperty({ example: [1, 2], required: false })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  participantIds?: number[];

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsNumber()
  ticketId?: number;
}