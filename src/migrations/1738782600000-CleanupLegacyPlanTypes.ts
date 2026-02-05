import { MigrationInterface, QueryRunner } from "typeorm";

export class CleanupLegacyPlanTypes1738782600000 implements MigrationInterface {
    name = 'CleanupLegacyPlanTypes1738782600000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Update existing records to valid plan types
        await queryRunner.query(`UPDATE "ai_subscription_profiles" SET "planType" = 'curieux' WHERE "planType" IN ('basic', 'enterprise', 'pro')`);
        
        // Note: For PostgreSQL, we might need to alter the enum type if it was defined as a custom type.
        // But TypeORM often uses CHECK constraints or simple VARCHAR for enums depending on driver.
        // We'll rely on the update for now.
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // No easy way to rollback unless we knew which ones were what, 
        // but these are legacy anyway.
    }
}
