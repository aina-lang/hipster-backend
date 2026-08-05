import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * 🔒 Admin uniquement — mise à jour du tarif de maintenance d'un site.
 */
export class UpdateMaintenancePricingDto {
  /** Montant mensuel HT. `null` remet le site en "tarif non défini". */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maintenancePrice?: number | null;

  @IsOptional()
  @IsString()
  maintenanceNotes?: string;
}
