import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddIsStripeVerifiedToAiUser1769000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('ai_users');
    if (!table?.findColumnByName('isStripeVerified')) {
      await queryRunner.addColumn(
        'ai_users',
        new TableColumn({
          name: 'isStripeVerified',
          type: 'boolean',
          isNullable: false,
          default: false,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('ai_users');
    if (table?.findColumnByName('isStripeVerified')) {
      await queryRunner.dropColumn('ai_users', 'isStripeVerified');
    }
  }
}
