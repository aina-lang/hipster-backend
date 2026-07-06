import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClientPortalPhase1SeedDefaultData1782556802000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('[Migration] Phase 1: Seeding default data for Client Portal');

    // Vérifier si on a une table request_categories (non, pour cette phase on utilise un enum)
    // Les catégories sont directement définies dans l'enum RequestCategory

    // On peut créer une table optionnelle pour permettre à l'admin de gérer les catégories
    // ou on peut les laisser en dur dans l'enum pour cette phase

    // Pour l'instant, on n'ajoute rien de plus - les catégories sont dans l'enum

    console.log('[Migration] Phase 1 seed completed: No database seed needed (using enums)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('[Migration] Phase 1 seed rollback completed');
  }
}
