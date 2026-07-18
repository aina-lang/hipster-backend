import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvertInvoiceAmountToDecimal1789814400000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('[Migration] Converting invoices.amount from varchar to decimal');

    // Check if amount column exists and is varchar
    const amountColInfo = await queryRunner.query(`
      SELECT COLUMN_TYPE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'invoices'
      AND COLUMN_NAME = 'amount'
    `);

    if (amountColInfo.length > 0 && amountColInfo[0].COLUMN_TYPE.includes('varchar')) {
      // Convert the column type from varchar to decimal
      await queryRunner.query(`
        ALTER TABLE \`invoices\`
        MODIFY COLUMN \`amount\` DECIMAL(10, 2) NULL
      `);
      console.log('[Migration] Successfully converted amount column to DECIMAL(10,2)');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback: convert back to varchar
    await queryRunner.query(`
      ALTER TABLE \`invoices\`
      MODIFY COLUMN \`amount\` VARCHAR(255) NULL
    `);
    console.log('[Migration] Rolled back amount column to VARCHAR(255)');
  }
}
