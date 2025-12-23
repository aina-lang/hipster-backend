import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsDateString,
} from 'class-validator';
import {
  SubscriptionStatus,
  PlanType,
} from '../entities/ai-subscription-profile.entity';

export class CreateIaClientProfileDto {
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  subscriptionStatus?: SubscriptionStatus = SubscriptionStatus.TRIAL;

  @IsOptional()
  @IsEnum(PlanType)
  planType?: PlanType = PlanType.BASIC;

  @IsOptional()
  @IsNumber()
  credits?: number = 1000;

  @IsOptional()
  @IsDateString()
  lastRenewalDate?: string;

  @IsOptional()
  @IsDateString()
  nextRenewalDate?: string;

  @IsNotEmpty()
  userId: number; // Relation OneToOne avec User
}
