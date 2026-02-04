import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContactEmailAndFixAdminProfile1764850356016
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add contactEmail to users table
    // Add contactEmail to users table if not exists
    const userCol = await queryRunner.query(`SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'contactEmail'`);
    if (Array.isArray(userCol) ? userCol[0].cnt === 0 : userCol[0]['cnt'] === 0) {
      await queryRunner.query(`ALTER TABLE \`users\` ADD COLUMN \`contactEmail\` varchar(255) NULL`);
    }

    // Add contactEmail to client_profiles table
    // Add contactEmail to client_profiles table if not exists
    const clientCol = await queryRunner.query(`SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'client_profiles' AND COLUMN_NAME = 'contactEmail'`);
    if (Array.isArray(clientCol) ? clientCol[0].cnt === 0 : clientCol[0]['cnt'] === 0) {
      await queryRunner.query(`ALTER TABLE \`client_profiles\` ADD COLUMN \`contactEmail\` varchar(255) NULL`);
    }

    // Add contactEmail to employee_profiles table
    // Add contactEmail to employee_profiles table if not exists
    const empCol = await queryRunner.query(`SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_profiles' AND COLUMN_NAME = 'contactEmail'`);
    if (Array.isArray(empCol) ? empCol[0].cnt === 0 : empCol[0]['cnt'] === 0) {
      await queryRunner.query(`ALTER TABLE \`employee_profiles\` ADD COLUMN \`contactEmail\` varchar(255) NULL`);
    }

    // Remove client profile from admin user (id=1)
    // First, get the client profile id for user 1
    await queryRunner.query(`
        DELETE FROM \`client_profiles\` 
        WHERE \`userId\` = 1
      `);

    console.log(
      '[Migration] Added contactEmail fields and removed admin client profile',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove contactEmail from employee_profiles
    // Remove contactEmail from employee_profiles if exists
    const empColDown = await queryRunner.query(`SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_profiles' AND COLUMN_NAME = 'contactEmail'`);
    if (Array.isArray(empColDown) ? empColDown[0].cnt > 0 : empColDown[0]['cnt'] > 0) {
      await queryRunner.query(`ALTER TABLE \`employee_profiles\` DROP COLUMN \`contactEmail\``);
    }

    // Remove contactEmail from client_profiles
    // Remove contactEmail from client_profiles if exists
    const clientColDown = await queryRunner.query(`SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'client_profiles' AND COLUMN_NAME = 'contactEmail'`);
    if (Array.isArray(clientColDown) ? clientColDown[0].cnt > 0 : clientColDown[0]['cnt'] > 0) {
      await queryRunner.query(`ALTER TABLE \`client_profiles\` DROP COLUMN \`contactEmail\``);
    }

    // Remove contactEmail from users
    // Remove contactEmail from users if exists
    const userColDown = await queryRunner.query(`SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'contactEmail'`);
    if (Array.isArray(userColDown) ? userColDown[0].cnt > 0 : userColDown[0]['cnt'] > 0) {
      await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`contactEmail\``);
    }

    console.log('[Migration] Rolled back contactEmail fields');
  }
}
