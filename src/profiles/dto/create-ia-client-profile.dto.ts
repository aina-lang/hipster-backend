import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsDateString,
  IsIn,
  IsString,
  IsEmail,
  IsBoolean,
} from 'class-validator';
import {
  SubscriptionStatus,
  PlanType,
} from '../entities/ai-subscription-profile.entity';

export class CreateIaClientProfileDto {
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  subscriptionStatus?: SubscriptionStatus;

  @IsOptional()
  @IsEnum(PlanType)
  planType?: PlanType;

  @IsOptional()
  @IsNumber()
  credits?: number;

  @IsOptional()
  @IsDateString()
  lastRenewalDate?: string;

  @IsOptional()
  @IsDateString()
  nextRenewalDate?: string;

  @IsOptional()
  @IsString()
  job?: string;

  @IsOptional()
  @IsBoolean()
  isSetupComplete?: boolean;

  @IsOptional()
  @IsString()
  brandingColor?: string;

  @IsOptional()
  @IsEmail()
  professionalEmail?: string;

  @IsOptional()
  @IsString()
  professionalAddress?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  professionalPhone?: string;

  @IsOptional()
  @IsString()
  professionalPhone2?: string;

  @IsOptional()
  @IsString()
  siret?: string;

  @IsOptional()
  @IsString()
  vatNumber?: string;

  @IsOptional()
  @IsString()
  bankDetails?: string;

  @IsOptional()
  @IsString()
  websiteUrl?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsNotEmpty()
  userId: number; // Relation OneToOne avec User
}
