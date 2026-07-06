import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClientPortalPhase1AddFieldsToExistingEntities1782556800000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log(
      '[Migration] Phase 1: Adding fields to Project, Ticket, Notification',
    );

    // ========== PROJECT TABLE ==========
    // Add modifications_restantes column
    let projectModColExists = await queryRunner.query(`
      SELECT COUNT(*) as cnt FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'projects' 
      AND COLUMN_NAME = 'modifications_restantes'
    `);
    projectModColExists =
      Array.isArray(projectModColExists) &&
      projectModColExists[0].cnt === 0
        ? true
        : false;

    if (projectModColExists) {
      await queryRunner.query(`
        ALTER TABLE \`projects\` 
        ADD COLUMN \`modifications_restantes\` int DEFAULT 3
      `);
      console.log('[Migration] Added modifications_restantes to projects');
    }

    // Add maintenance_active column
    let projectMaintenanceColExists = await queryRunner.query(`
      SELECT COUNT(*) as cnt FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'projects' 
      AND COLUMN_NAME = 'maintenance_active'
    `);
    projectMaintenanceColExists =
      Array.isArray(projectMaintenanceColExists) &&
      projectMaintenanceColExists[0].cnt === 0
        ? true
        : false;

    if (projectMaintenanceColExists) {
      await queryRunner.query(`
        ALTER TABLE \`projects\` 
        ADD COLUMN \`maintenance_active\` boolean DEFAULT FALSE
      `);
      console.log('[Migration] Added maintenance_active to projects');
    }

    // ========== TICKETS TABLE ==========
    // Add category column
    let ticketCategoryColExists = await queryRunner.query(`
      SELECT COUNT(*) as cnt FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tickets' 
      AND COLUMN_NAME = 'category'
    `);
    ticketCategoryColExists =
      Array.isArray(ticketCategoryColExists) &&
      ticketCategoryColExists[0].cnt === 0
        ? true
        : false;

    if (ticketCategoryColExists) {
      await queryRunner.query(`
        ALTER TABLE \`tickets\` 
        ADD COLUMN \`category\` ENUM('anomaly', 'modification', 'evolution') DEFAULT 'anomaly'
      `);
      console.log('[Migration] Added category to tickets');
    }

    // Add projectId column if doesn't exist
    let ticketProjectIdExists = await queryRunner.query(`
      SELECT COUNT(*) as cnt FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tickets' 
      AND COLUMN_NAME = 'projectId'
    `);
    ticketProjectIdExists =
      Array.isArray(ticketProjectIdExists) &&
      ticketProjectIdExists[0].cnt === 0
        ? true
        : false;

    if (ticketProjectIdExists) {
      await queryRunner.query(`
        ALTER TABLE \`tickets\` 
        ADD COLUMN \`projectId\` int NULL
      `);
      await queryRunner.query(`
        ALTER TABLE \`tickets\` 
        ADD CONSTRAINT FK_tickets_projectId 
        FOREIGN KEY (\`projectId\`) 
        REFERENCES \`projects\`(\`id\`) 
        ON DELETE CASCADE
      `);
      console.log('[Migration] Added projectId to tickets');
    }

    // ========== NOTIFICATIONS TABLE ==========
    // Add projectId column
    let notificationProjectIdExists = await queryRunner.query(`
      SELECT COUNT(*) as cnt FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'notifications' 
      AND COLUMN_NAME = 'projectId'
    `);
    notificationProjectIdExists =
      Array.isArray(notificationProjectIdExists) &&
      notificationProjectIdExists[0].cnt === 0
        ? true
        : false;

    if (notificationProjectIdExists) {
      await queryRunner.query(`
        ALTER TABLE \`notifications\` 
        ADD COLUMN \`projectId\` int NULL
      `);
      console.log('[Migration] Added projectId to notifications');
    }

    // Add ticketId column
    let notificationTicketIdExists = await queryRunner.query(`
      SELECT COUNT(*) as cnt FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'notifications' 
      AND COLUMN_NAME = 'ticketId'
    `);
    notificationTicketIdExists =
      Array.isArray(notificationTicketIdExists) &&
      notificationTicketIdExists[0].cnt === 0
        ? true
        : false;

    if (notificationTicketIdExists) {
      await queryRunner.query(`
        ALTER TABLE \`notifications\` 
        ADD COLUMN \`ticketId\` int NULL
      `);
      console.log('[Migration] Added ticketId to notifications');
    }

    // Add documentId column
    let notificationDocumentIdExists = await queryRunner.query(`
      SELECT COUNT(*) as cnt FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'notifications' 
      AND COLUMN_NAME = 'documentId'
    `);
    notificationDocumentIdExists =
      Array.isArray(notificationDocumentIdExists) &&
      notificationDocumentIdExists[0].cnt === 0
        ? true
        : false;

    if (notificationDocumentIdExists) {
      await queryRunner.query(`
        ALTER TABLE \`notifications\` 
        ADD COLUMN \`documentId\` int NULL
      `);
      console.log('[Migration] Added documentId to notifications');
    }

    // Add actionUrl column
    let notificationActionUrlExists = await queryRunner.query(`
      SELECT COUNT(*) as cnt FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'notifications' 
      AND COLUMN_NAME = 'actionUrl'
    `);
    notificationActionUrlExists =
      Array.isArray(notificationActionUrlExists) &&
      notificationActionUrlExists[0].cnt === 0
        ? true
        : false;

    if (notificationActionUrlExists) {
      await queryRunner.query(`
        ALTER TABLE \`notifications\` 
        ADD COLUMN \`actionUrl\` varchar(500) NULL
      `);
      console.log('[Migration] Added actionUrl to notifications');
    }

    console.log(
      '[Migration] Phase 1 completed: All fields added to existing entities',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log(
      '[Migration] Rolling back Phase 1: Removing added fields from entities',
    );

    // Remove from projects
    await queryRunner.query(`
      ALTER TABLE \`projects\` DROP COLUMN IF EXISTS \`modifications_restantes\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`projects\` DROP COLUMN IF EXISTS \`maintenance_active\`
    `);

    // Remove from tickets
    await queryRunner.query(`
      ALTER TABLE \`tickets\` DROP FOREIGN KEY IF EXISTS FK_tickets_projectId
    `);
    await queryRunner.query(`
      ALTER TABLE \`tickets\` DROP COLUMN IF EXISTS \`category\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`tickets\` DROP COLUMN IF EXISTS \`projectId\`
    `);

    // Remove from notifications
    await queryRunner.query(`
      ALTER TABLE \`notifications\` DROP COLUMN IF EXISTS \`projectId\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`notifications\` DROP COLUMN IF EXISTS \`ticketId\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`notifications\` DROP COLUMN IF EXISTS \`documentId\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`notifications\` DROP COLUMN IF EXISTS \`actionUrl\`
    `);

    console.log('[Migration] Phase 1 rollback completed');
  }
}
