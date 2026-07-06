import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddReferralFieldsToAiUser1741593000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('ai_users');

    if (!table?.findColumnByName('referralCode')) {
      await queryRunner.addColumn(
        'ai_users',
        new TableColumn({
          name: 'referralCode',
          type: 'varchar',
          length: '255',
          isUnique: true,
          isNullable: true,
        }),
      );
    }

    if (!table?.findColumnByName('referredBy')) {
      await queryRunner.addColumn(
        'ai_users',
        new TableColumn({
          name: 'referredBy',
          type: 'varchar',
          length: '255',
          isNullable: true,
        }),
      );
    }

    if (!table?.findColumnByName('isAmbassador')) {
      await queryRunner.addColumn(
        'ai_users',
        new TableColumn({
          name: 'isAmbassador',
          type: 'tinyint',
          default: 0,
        }),
      );
    }

    if (!table?.findColumnByName('freeMonthsPending')) {
      await queryRunner.addColumn(
        'ai_users',
        new TableColumn({
          name: 'freeMonthsPending',
          type: 'int',
          default: 0,
        }),
      );
    }

    if (!table?.findColumnByName('discountMonthsCount')) {
      await queryRunner.addColumn(
        'ai_users',
        new TableColumn({
          name: 'discountMonthsCount',
          type: 'int',
          default: 0,
        }),
      );
    }

    if (!table?.findColumnByName('lastFreeMonthAppliedAt')) {
      await queryRunner.addColumn(
        'ai_users',
        new TableColumn({
          name: 'lastFreeMonthAppliedAt',
          type: 'timestamp',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('ai_users');

    if (table?.findColumnByName('lastFreeMonthAppliedAt')) {
      await queryRunner.dropColumn('ai_users', 'lastFreeMonthAppliedAt');
    }
    if (table?.findColumnByName('discountMonthsCount')) {
      await queryRunner.dropColumn('ai_users', 'discountMonthsCount');
    }
    if (table?.findColumnByName('freeMonthsPending')) {
      await queryRunner.dropColumn('ai_users', 'freeMonthsPending');
    }
    if (table?.findColumnByName('isAmbassador')) {
      await queryRunner.dropColumn('ai_users', 'isAmbassador');
    }
    if (table?.findColumnByName('referredBy')) {
      await queryRunner.dropColumn('ai_users', 'referredBy');
    }
    if (table?.findColumnByName('referralCode')) {
      await queryRunner.dropColumn('ai_users', 'referralCode');
    }
  }
}
