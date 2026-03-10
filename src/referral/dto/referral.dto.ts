import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ApplyReferralDto {
  @ApiProperty({
    description: 'Le code de parrainage à appliquer',
    example: 'REF-MAR-A1B2',
  })
  @IsString()
  @IsNotEmpty()
  code: string;
}

export class ReferralStatsDto {
  @ApiProperty({
    description: 'Le code de parrainage unique de l’utilisateur',
    example: 'REF-JOE-ABCD',
  })
  referralCode: string;

  @ApiProperty({
    description: 'Nombre total de filleuls ayant un abonnement actif',
    example: 5,
  })
  totalReferred: number;

  @ApiProperty({
    description: 'Si l’utilisateur bénéficie du statut Ambassadeur',
    example: false,
  })
  isAmbassador: boolean;

  @ApiProperty({
    description: 'Nombre de mois d’abonnement gratuits en attente d’être appliqués',
    example: 2,
  })
  freeMonthsPending: number;

  @ApiProperty({
    description: 'Devise utilisée pour les transactions',
    example: 'EUR',
  })
  currency: string;
}
