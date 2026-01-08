export enum LoyaltyTier {
  STANDARD = 'Standard',
  BRONZE = 'Bronze',
  SILVER = 'Silver',
  GOLD = 'Gold',
}

export const LOYALTY_RULES = {
  [LoyaltyTier.STANDARD]: { minProjects: 0, reward: 'Aucune' },
  [LoyaltyTier.BRONZE]: { minProjects: 3, reward: '10% sur le prochain devis' },
  [LoyaltyTier.SILVER]: {
    minProjects: 5,
    reward: '1 mois de maintenance offerte',
  },
  [LoyaltyTier.GOLD]: { minProjects: 10, reward: 'Réduction VIP permanente' },
};

export interface LoyaltyStatus {
  tier: LoyaltyTier;
  projectCount: number;
  nextTier?: LoyaltyTier;
  projectsToNextTier?: number;
  currentReward: string;
  nextReward?: string;
  progress: number; // 0-100 to next tier
}
