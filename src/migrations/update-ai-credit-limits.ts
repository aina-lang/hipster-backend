import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateAiCreditLimits1707132000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update Curieux plan limits (3 texts/day, 2 images/day, 0 video, 0 audio)
    await queryRunner.query(`
      UPDATE \`ai_credits\` ac
      JOIN \`ai_subscription_profiles\` asp ON ac.\`aiProfileId\` = asp.\`id\`
      SET 
        ac.\`promptsLimit\` = 3,
        ac.\`imagesLimit\` = 2,
        ac.\`videosLimit\` = 0,
        ac.\`audioLimit\` = 0
      WHERE asp.\`planType\` = 'CURIEUX'
    `);

    // Update Atelier plan limits (unlimited texts, 100 images/month, 0 video, 0 audio)
    await queryRunner.query(`
      UPDATE \`ai_credits\` ac
      JOIN \`ai_subscription_profiles\` asp ON ac.\`aiProfileId\` = asp.\`id\`
      SET 
        ac.\`promptsLimit\` = 999999,
        ac.\`imagesLimit\` = 100,
        ac.\`videosLimit\` = 0,
        ac.\`audioLimit\` = 0
      WHERE asp.\`planType\` = 'ATELIER'
    `);

    // Update Studio plan limits (unlimited texts, 100 images/month, 3 videos/month, 0 audio)
    await queryRunner.query(`
      UPDATE \`ai_credits\` ac
      JOIN \`ai_subscription_profiles\` asp ON ac.\`aiProfileId\` = asp.\`id\`
      SET 
        ac.\`promptsLimit\` = 999999,
        ac.\`imagesLimit\` = 100,
        ac.\`videosLimit\` = 3,
        ac.\`audioLimit\` = 0
      WHERE asp.\`planType\` = 'STUDIO'
    `);

    // Update Agence plan limits (unlimited texts, 300 images/month, 10 videos/month, 60 audios/month)
    await queryRunner.query(`
      UPDATE \`ai_credits\` ac
      JOIN \`ai_subscription_profiles\` asp ON ac.\`aiProfileId\` = asp.\`id\`
      SET 
        ac.\`promptsLimit\` = 999999,
        ac.\`imagesLimit\` = 300,
        ac.\`videosLimit\` = 10,
        ac.\`audioLimit\` = 60
      WHERE asp.\`planType\` = 'AGENCE'
    `);

    // Update any credits without a plan (set to Curieux defaults)
    await queryRunner.query(`
      UPDATE \`ai_credits\` ac
      LEFT JOIN \`ai_subscription_profiles\` asp ON ac.\`aiProfileId\` = asp.\`id\`
      SET 
        ac.\`promptsLimit\` = 3,
        ac.\`imagesLimit\` = 2,
        ac.\`videosLimit\` = 0,
        ac.\`audioLimit\` = 0
      WHERE asp.\`planType\` IS NULL OR asp.\`planType\` = ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback to old limits if needed
    await queryRunner.query(`
      UPDATE \`ai_credits\`
      SET 
        \`promptsLimit\` = 100,
        \`imagesLimit\` = 50,
        \`videosLimit\` = 10,
        \`audioLimit\` = 20
    `);
  }
}
