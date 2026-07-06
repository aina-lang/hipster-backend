import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class ClientPortalPhase1CreateNewTables1782556801000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('[Migration] Phase 1: Creating new tables for Client Portal');

    // ========== PROJECT_UPDATES TABLE ==========
    const projectUpdatesTableExists = await queryRunner.hasTable('project_updates');

    if (!projectUpdatesTableExists) {
      await queryRunner.createTable(
        new Table({
          name: 'project_updates',
          columns: [
            {
              name: 'id',
              type: 'int',
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'increment',
            },
            {
              name: 'projectId',
              type: 'int',
              isNullable: false,
            },
            {
              name: 'type',
              type: 'enum',
              enum: [
                'created',
                'status_changed',
                'document_added',
                'comment_added',
                'message_added',
              ],
              isNullable: false,
            },
            {
              name: 'title',
              type: 'varchar',
              length: '255',
              isNullable: true,
            },
            {
              name: 'description',
              type: 'text',
              isNullable: true,
            },
            {
              name: 'metadata',
              type: 'json',
              isNullable: true,
            },
            {
              name: 'createdAt',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
            },
          ],
          indices: [
            {
              name: 'IDX_project_updates_projectId',
              columnNames: ['projectId'],
            },
            {
              name: 'IDX_project_updates_projectId_createdAt',
              columnNames: ['projectId', 'createdAt'],
            },
          ],
          foreignKeys: [
            {
              columnNames: ['projectId'],
              referencedColumnNames: ['id'],
              referencedTableName: 'projects',
              onDelete: 'CASCADE',
            },
          ],
        }),
      );

      console.log('[Migration] Created project_updates table');
    }

    // ========== PROJECT_COMMENTS TABLE ==========
    const projectCommentsTableExists = await queryRunner.hasTable(
      'project_comments',
    );

    if (!projectCommentsTableExists) {
      await queryRunner.createTable(
        new Table({
          name: 'project_comments',
          columns: [
            {
              name: 'id',
              type: 'int',
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'increment',
            },
            {
              name: 'projectId',
              type: 'int',
              isNullable: false,
            },
            {
              name: 'userId',
              type: 'int',
              isNullable: false,
            },
            {
              name: 'comment',
              type: 'text',
              isNullable: false,
            },
            {
              name: 'createdAt',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
            },
            {
              name: 'updatedAt',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
              onUpdate: 'CURRENT_TIMESTAMP',
            },
          ],
          indices: [
            {
              name: 'IDX_project_comments_projectId',
              columnNames: ['projectId'],
            },
            {
              name: 'IDX_project_comments_projectId_createdAt',
              columnNames: ['projectId', 'createdAt'],
            },
          ],
          foreignKeys: [
            {
              columnNames: ['projectId'],
              referencedColumnNames: ['id'],
              referencedTableName: 'projects',
              onDelete: 'CASCADE',
            },
            {
              columnNames: ['userId'],
              referencedColumnNames: ['id'],
              referencedTableName: 'users',
              onDelete: 'CASCADE',
            },
          ],
        }),
      );

      console.log('[Migration] Created project_comments table');
    }

    // ========== MESSAGE_ATTACHMENTS TABLE ==========
    const messageAttachmentsTableExists = await queryRunner.hasTable(
      'message_attachments',
    );

    if (!messageAttachmentsTableExists) {
      await queryRunner.createTable(
        new Table({
          name: 'message_attachments',
          columns: [
            {
              name: 'id',
              type: 'int',
              isPrimary: true,
              isGenerated: true,
              generationStrategy: 'increment',
            },
            {
              name: 'messageId',
              type: 'int',
              isNullable: false,
            },
            {
              name: 'fileUrl',
              type: 'varchar',
              length: '500',
              isNullable: true,
            },
            {
              name: 'fileName',
              type: 'varchar',
              length: '255',
              isNullable: true,
            },
            {
              name: 'fileSize',
              type: 'int',
              isNullable: true,
            },
            {
              name: 'fileType',
              type: 'varchar',
              length: '50',
              isNullable: true,
            },
            {
              name: 'uploadedAt',
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
            },
          ],
          indices: [
            {
              name: 'IDX_message_attachments_messageId',
              columnNames: ['messageId'],
            },
          ],
          foreignKeys: [
            {
              columnNames: ['messageId'],
              referencedColumnNames: ['id'],
              referencedTableName: 'chat_messages',
              onDelete: 'CASCADE',
            },
          ],
        }),
      );

      console.log('[Migration] Created message_attachments table');
    }

    console.log('[Migration] Phase 1 completed: All new tables created');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log(
      '[Migration] Rolling back Phase 1: Dropping new tables',
    );

    await queryRunner.dropTable('message_attachments', true);
    await queryRunner.dropTable('project_comments', true);
    await queryRunner.dropTable('project_updates', true);

    console.log('[Migration] Phase 1 rollback completed');
  }
}
