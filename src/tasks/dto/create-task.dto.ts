import {
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  IsArray,
  IsNumber,
  IsString,
  MinLength,
} from 'class-validator';
import { TaskStatus, TaskPriority } from '../entities/task.entity';

export class CreateTaskDto {
  /** Titre de la tâche */
  @IsNotEmpty({ message: 'Le titre est obligatoire.' })
  @IsString()
  @MinLength(3, { message: 'Le titre doit comporter au moins 3 caractères.' })
  title: string;

  /** Description facultative */
  @IsOptional()
  @IsString()
  description?: string;

  /** Statut de la tâche */
  @IsOptional()
  @IsEnum(TaskStatus, {
    message:
      'Statut invalide. Valeurs autorisées : TODO, IN_PROGRESS, REVIEW, DONE, BLOCKED',
  })
  status?: TaskStatus;

  /** Priorité de la tâche */
  @IsOptional()
  @IsEnum(TaskPriority, {
    message: 'Priorité invalide. Valeurs autorisées : LOW, MEDIUM, HIGH',
  })
  priority?: TaskPriority;

  /** Date limite */
  @IsOptional()
  @IsDateString(
    {},
    { message: 'La date doit être au format ISO (YYYY-MM-DD).' },
  )
  dueDate?: string;

  /** Projet parent */
  @IsNotEmpty({ message: 'Le projet associé est obligatoire.' })
  @IsNumber({}, { message: 'projectId doit être un nombre.' })
  projectId: number;

  /** Liste des utilisateurs assignés à la tâche */
  @IsOptional()
  @IsArray({ message: 'assigneeIds doit être un tableau d’identifiants.' })
  @IsNumber(
    {},
    { each: true, message: 'Chaque assigneeId doit être un nombre.' },
  )
  assigneeIds?: number[];

  // Recurrence
  @IsOptional()
  @IsString()
  recurrenceType?: string;

  @IsOptional()
  @IsNumber()
  recurrenceInterval?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recurrenceDays?: string[];
}
