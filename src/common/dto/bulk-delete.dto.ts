import { IsArray, IsInt, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkDeleteDto {
  @ApiProperty({
    type: [Number],
    description: 'IDs des entités à supprimer',
    example: [1, 2, 3],
  })
  @IsArray()
  @IsInt({ each: true })
  @ArrayMinSize(1, { message: 'Au moins un ID doit être fourni' })
  ids: number[];
}
