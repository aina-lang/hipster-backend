/**
 * Champs tarifaires d'un site client — 🔒 jamais exposés hors admin.
 */
export const WEBSITE_PRICING_FIELDS = [
  'maintenancePrice',
  'maintenanceNotes',
] as const;

/**
 * Retire les champs tarifaires d'un site avant envoi à un non-admin.
 * Mutation en place : les entités proviennent d'un `find()` et ne sont pas réutilisées.
 */
export function stripWebsitePricing<T>(website: T): T {
  if (!website || typeof website !== 'object') return website;
  for (const field of WEBSITE_PRICING_FIELDS) {
    delete (website as Record<string, unknown>)[field];
  }
  return website;
}

export function stripWebsitePricingFromAll<T>(websites: T[] | null | undefined): void {
  websites?.forEach((w) => stripWebsitePricing(w));
}
