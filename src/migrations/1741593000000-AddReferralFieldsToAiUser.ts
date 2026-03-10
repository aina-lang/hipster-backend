import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddReferralFieldsToAiUser1741593000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('ai_users', [
      new TableColumn({
        name: 'referralCode',
        type: 'varchar',
        length: '255',
        isUnique: true,
        isNullable: true,
      }),
      new TableColumn({
        name: 'referredBy',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
      new TableColumn({
        name: 'isAmbassador',
        type: 'tinyint',
        default: 0,
      }),
      new TableColumn({
        name: 'freeMonthsPending',
        type: 'int',
        default: 0,
      }),
      new TableColumn({
        name: 'discountMonthsCount',
        type: 'int',
        default: 0,
      }),
      new TableColumn({
        name: 'lastFreeMonthAppliedAt',
        type: 'timestamp',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('ai_users', 'lastFreeMonthAppliedAt');
    await queryRunner.dropColumn('ai_users', 'discountMonthsCount');
    await queryRunner.dropColumn('ai_users', 'freeMonthsPending');
    await queryRunner.dropColumn('ai_users', 'isAmbassador');
    await queryRunner.dropColumn('ai_users', 'referredBy');
    await queryRunner.dropColumn('ai_users', 'referralCode');
  }
}
