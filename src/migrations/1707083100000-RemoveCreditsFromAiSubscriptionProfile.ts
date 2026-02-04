import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveCreditsFromAiSubscriptionProfile1707083100000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enlever la colonne credits de la table ai_subscription_profiles
    await queryRunner.query(`
      ALTER TABLE \`ai_subscription_profiles\` 
      DROP COLUMN \`credits\`
    `);

    console.log('[Migration] Removed credits column from ai_subscription_profiles');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restaurer la colonne credits
    await queryRunner.query(`
      ALTER TABLE \`ai_subscription_profiles\` 
      ADD \`credits\` int NOT NULL DEFAULT 1000
    `);

    console.log('[Migration] Restored credits column to ai_subscription_profiles');
  }
}
