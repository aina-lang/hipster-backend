export const POSTE_PERMISSIONS: Record<string, string[]> = {
  // CONFIGURATION SIMPLIFIÉE : Tous les employés reçoivent les permissions par défaut.
  // Décommentez ou ajoutez des règles spécifiques ici si nécessaire pour surcharger le défaut.
  
  /*
  // 🔹 GESTION DE PROJET
  'chef de projet': [
    'manage:projects',
    'manage:support',
  ],

  // 🔹 DÉVELOPPEURS
  'développeur': [
    'manage:projects',
  ],
  */
};

export const DEFAULT_EMPLOYEE_PERMISSIONS = [
  // Module Projet (Projets + Tâches)
  'view:projects',
  'create:projects',
  'update:projects',
  'delete:projects',
  
  'view:tasks',
  'create:tasks',
  'update:tasks',
  'delete:tasks',
  
  // Clients (souvent nécessaire pour les projets)
  'view:clients',
  
  // Support / Tickets (Gestion du support)
  'view:tickets',
  'create:tickets',
  'reply:tickets',
  'delete:tickets',
];
