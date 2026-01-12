import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsDateString,
  IsIn,
  IsString,
  IsEmail,
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

  @IsOptional()
  @IsIn(['particulier', 'entreprise'])
  profileType?: 'particulier' | 'entreprise';

  @IsOptional()
  @IsString()
  companyName?: string;

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
