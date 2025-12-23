import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContactEmailAndFixAdminProfile1764850356016
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add contactEmail to users table
    await queryRunner.query(`
            ALTER TABLE \`users\` 
            ADD COLUMN \`contactEmail\` varchar(255) NULL
        `);

    // Add contactEmail to client_profiles table
    await queryRunner.query(`
            ALTER TABLE \`client_profiles\` 
            ADD COLUMN \`contactEmail\` varchar(255) NULL
        `);

    // Add contactEmail to employee_profiles table
    await queryRunner.query(`
            ALTER TABLE \`employee_profiles\` 
            ADD COLUMN \`contactEmail\` varchar(255) NULL
        `);

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
    await queryRunner.query(`
            ALTER TABLE \`employee_profiles\` 
            DROP COLUMN \`contactEmail\`
        `);

    // Remove contactEmail from client_profiles
    await queryRunner.query(`
            ALTER TABLE \`client_profiles\` 
            DROP COLUMN \`contactEmail\`
        `);

    // Remove contactEmail from users
    await queryRunner.query(`
            ALTER TABLE \`users\` 
            DROP COLUMN \`contactEmail\`
        `);

    console.log('[Migration] Rolled back contactEmail fields');
  }
}
