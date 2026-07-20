import { IsString, IsNotEmpty, IsOptional, IsInt, Min, IsEnum, IsArray } from 'class-validator';
import { RecipeDifficulty } from '../entities/recipe.entity';

export class CreateRecipeDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ingredients?: string[];

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  cookingTime?: number;

  @IsOptional()
  @IsEnum(RecipeDifficulty)
  difficulty?: RecipeDifficulty;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}
