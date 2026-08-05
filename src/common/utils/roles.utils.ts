import { Role } from '../enums/role.enum';

/**
 * Normalise les rôles issus du JWT.
 * Ils arrivent parfois double-encodés (`'["admin"]'`) selon la façon dont ils
 * ont été persistés — cette fonction absorbe les deux formes.
 */
export function normalizeRoles(rawRoles: unknown): string[] {
  const source = Array.isArray(rawRoles)
    ? rawRoles
    : rawRoles == null
      ? []
      : [rawRoles];

  const roles: string[] = [];
  for (const role of source) {
    if (typeof role === 'string' && role.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(role);
        if (Array.isArray(parsed)) {
          parsed.forEach((r) => roles.push(String(r).toLowerCase().trim()));
          continue;
        }
      } catch {
        /* valeur non JSON : traitée telle quelle ci-dessous */
      }
    }
    roles.push(String(role).toLowerCase().trim());
  }
  return roles;
}

/** `true` si l'utilisateur porte le rôle admin. */
export function isAdminUser(user: { roles?: unknown } | null | undefined): boolean {
  return normalizeRoles(user?.roles).includes(Role.ADMIN);
}

/**
 * 🔒 Seul ce compte admin voit les tarifs de maintenance.
 * Surchargeable via `MAINTENANCE_PRICING_ADMIN_EMAIL` (utile hors production).
 */
export const MAINTENANCE_PRICING_ADMIN_EMAIL = (
  process.env.MAINTENANCE_PRICING_ADMIN_EMAIL || 'lise.delvert@gmail.com'
)
  .toLowerCase()
  .trim();

/**
 * `true` uniquement pour l'admin autorisé aux tarifs de maintenance.
 * Les autres admins gardent l'accès au suivi des sites, sans les montants.
 */
export function isMaintenancePricingAdmin(
  user: { roles?: unknown; email?: unknown } | null | undefined,
): boolean {
  if (!isAdminUser(user)) return false;
  const email = typeof user?.email === 'string' ? user.email.toLowerCase().trim() : '';
  return email === MAINTENANCE_PRICING_ADMIN_EMAIL;
}
