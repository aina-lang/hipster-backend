import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddStripeSubscriptionIdToAiUser1739184000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add stripeSubscriptionId column to ai_users table if it does not already exist.
    const table = await queryRunner.getTable('ai_users');
    if (!table?.findColumnByName('stripeSubscriptionId')) {
      await queryRunner.addColumn(
        'ai_users',
        new TableColumn({
          name: 'stripeSubscriptionId',
          type: 'varchar',
          length: '255',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove stripeSubscriptionId column from ai_users table if it exists.
    const table = await queryRunner.getTable('ai_users');
    if (table?.findColumnByName('stripeSubscriptionId')) {
      await queryRunner.dropColumn('ai_users', 'stripeSubscriptionId');
    }
  }
}
