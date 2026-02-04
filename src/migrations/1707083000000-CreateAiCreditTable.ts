import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiCreditTable1707083000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Créer la table ai_credits
    await queryRunner.query(`
      CREATE TABLE \`ai_credits\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`promptsLimit\` int NOT NULL DEFAULT 100,
        \`imagesLimit\` int NOT NULL DEFAULT 50,
        \`videosLimit\` int NOT NULL DEFAULT 10,
        \`audioLimit\` int NOT NULL DEFAULT 20,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`aiProfileId\` int NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`IDX_aiProfileId\` (\`aiProfileId\`),
        CONSTRAINT \`FK_aiProfileId\` FOREIGN KEY (\`aiProfileId\`) REFERENCES \`ai_subscription_profiles\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('[Migration] Created ai_credits table');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Supprimer la table
    await queryRunner.query(`DROP TABLE IF EXISTS \`ai_credits\``);

    console.log('[Migration] Dropped ai_credits table');
  }
}
