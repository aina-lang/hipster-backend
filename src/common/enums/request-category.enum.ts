export enum RequestCategory {
  ANOMALY = 'anomaly',
  MODIFICATION = 'modification',
  EVOLUTION = 'evolution',
}

export const RequestCategoryLabels: Record<RequestCategory, string> = {
  [RequestCategory.ANOMALY]: 'Anomalie / Bug',
  [RequestCategory.MODIFICATION]: 'Modification incluse',
  [RequestCategory.EVOLUTION]: 'Nouvelle demande / Évolution',
};

export const RequestCategoryDescriptions: Record<RequestCategory, string> = {
  [RequestCategory.ANOMALY]: 'Signaler un bug ou un dysfonctionnement',
  [RequestCategory.MODIFICATION]: 'Demande de modification dans le cadre du contrat',
  [RequestCategory.EVOLUTION]: 'Évolution du projet nécessitant possiblement un devis',
};
