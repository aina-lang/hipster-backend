import { IsInt, IsNotEmpty, Min } from 'class-validator';

export class GenerateCodesDto {
  @IsInt()
  @IsNotEmpty()
  @Min(1)
  videoId: number;

  @IsInt()
  @Min(1)
  count: number;
}
