import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiCreditsAndRemoveCreditsFromAiSubscriptionProfile1767700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create ai_credits table if it does not exist
    const tableCheck: any = await queryRunner.query(
      `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_credits'`,
    );
    const tableExists = Array.isArray(tableCheck) ? tableCheck[0].cnt > 0 : tableCheck[0]['cnt'] > 0;
    if (!tableExists) {
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log('[Migration] Created ai_credits table');
    } else {
      console.log('[Migration] ai_credits table already exists, skipping creation');
    }

    // Remove credits column from ai_subscription_profiles if exists
    const colCheck: any = await queryRunner.query(
      `SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_subscription_profiles' AND COLUMN_NAME = 'credits'`,
    );
    const colExists = Array.isArray(colCheck) ? colCheck[0].cnt > 0 : colCheck[0]['cnt'] > 0;
    if (colExists) {
      await queryRunner.query(`ALTER TABLE \`ai_subscription_profiles\` DROP COLUMN \`credits\``);
      console.log('[Migration] Removed credits column from ai_subscription_profiles');
    } else {
      console.log('[Migration] credits column not present on ai_subscription_profiles, skipping');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore credits column if missing
    const colCheckDown: any = await queryRunner.query(
      `SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_subscription_profiles' AND COLUMN_NAME = 'credits'`,
    );
    const colExistsDown = Array.isArray(colCheckDown) ? colCheckDown[0].cnt > 0 : colCheckDown[0]['cnt'] > 0;
    if (!colExistsDown) {
      await queryRunner.query(`ALTER TABLE \`ai_subscription_profiles\` ADD \`credits\` int NOT NULL DEFAULT 1000`);
      console.log('[Migration] Restored credits column to ai_subscription_profiles');
    } else {
      console.log('[Migration] credits column already present on ai_subscription_profiles, skipping restore');
    }

    // Drop ai_credits table if exists
    await queryRunner.query(`DROP TABLE IF EXISTS \`ai_credits\``);
    console.log('[Migration] Dropped ai_credits table if it existed');
  }
}
