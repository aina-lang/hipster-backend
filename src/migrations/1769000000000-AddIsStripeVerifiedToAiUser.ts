import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsStripeVerifiedToAiUser1769000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_users" ADD COLUMN IF NOT EXISTS "isStripeVerified" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ai_users" DROP COLUMN IF EXISTS "isStripeVerified"`,
    );
  }
}
