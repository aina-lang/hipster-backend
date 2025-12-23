export interface MaintenanceConfig {
  // Fréquence de la maintenance
  frequency: 'daily' | 'weekly' | 'monthly' | 'custom';

  // Pour weekly: jours de la semaine (0 = dimanche, 6 = samedi)
  weekDays?: number[];

  // Pour monthly: jour du mois (1-31)
  monthDay?: number;

  // Pour custom: expression cron
  cronExpression?: string;

  // Tâches à créer automatiquement
  autoTasks?: {
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
  }[];

  // Activer/désactiver la maintenance automatique
  enabled: boolean;
}
