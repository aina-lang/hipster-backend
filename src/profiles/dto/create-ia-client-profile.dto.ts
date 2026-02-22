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
import { Type, Transform } from 'class-transformer';
import { SubscriptionStatus, PlanType } from 'src/ai/entities/ai-user.entity';

export class CreateIaClientProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @Transform(({ value }) => {
    // If no value, return as-is (undefined/null)
    if (value === undefined || value === null) return value;
    // If already a valid enum value (lowercase), return as-is
    if (Object.values(SubscriptionStatus).includes(value)) return value;
    // If uppercase key (like 'ACTIVE'), convert to enum value
    try {
      const enumValue =
        SubscriptionStatus[value as keyof typeof SubscriptionStatus];
      if (enumValue) return enumValue;
    } catch (e) {
      // Ignore and return original value for validator to reject
    }
    return value;
  })
  @IsEnum(SubscriptionStatus, {
    message: `subscriptionStatus must be one of: ${Object.values(SubscriptionStatus).join(', ')}`,
  })
  subscriptionStatus?: SubscriptionStatus;

  @IsOptional()
  @Transform(({ value }) => {
    // If no value, return as-is (undefined/null)
    if (value === undefined || value === null) return value;
    // If already a valid enum value (lowercase), return as-is
    if (Object.values(PlanType).includes(value)) return value;
    // If uppercase key (like 'CURIEUX'), convert to enum value
    try {
      const enumValue = PlanType[value as keyof typeof PlanType];
      if (enumValue) return enumValue;
    } catch (e) {
      // Ignore and return original value for validator to reject
    }
    return value;
  })
  @IsEnum(PlanType, {
    message: `planType must be one of: ${Object.values(PlanType).join(', ')}`,
  })
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
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsEmail({}, { message: "Format d'email invalide" })
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
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  stripeCustomerId?: string;

  @IsOptional()
  @IsString()
  stripeSubscriptionId?: string;

  @IsOptional()
  @IsNumber()
  promptsLimit?: number;

  @IsOptional()
  @IsNumber()
  imagesLimit?: number;

  @IsOptional()
  @IsNumber()
  videosLimit?: number;

  @IsOptional()
  @IsNumber()
  audioLimit?: number;

  @IsOptional()
  @IsNumber()
  threeDLimit?: number;

  @IsOptional()
  @IsDateString()
  subscriptionStartDate?: string;

  @IsOptional()
  @IsDateString()
  subscriptionEndDate?: string;

  @IsOptional()
  @IsBoolean()
  hasUsedTrial?: boolean;

  @IsOptional()
  @IsNumber()
  userId?: number; // Relation OneToOne avec User - Optional car passé dans l'URL
}
