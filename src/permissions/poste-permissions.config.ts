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
  'manage:projects',
  'manage:invoices',
];
