import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crée la table de jonction `task_files` (Task ⟷ File), introduite avec les
 * médias joints aux tâches. Sur les bases où `synchronize` est désactivé, elle
 * n'a jamais été créée : `GET /tasks/my` échoue alors en 500 sur
 * « Table 'task_files' doesn't exist », et l'employé ne voit aucune tâche.
 *
 * Le DDL reprend exactement celui que TypeORM génère — noms d'index et de
 * contraintes compris — pour qu'une synchronisation ultérieure reconnaisse la
 * table comme conforme au lieu de vouloir la recréer.
 */
export class CreateTaskFilesJoinTable1789900000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const [{ cnt }] = await queryRunner.query(`
      SELECT COUNT(*) as cnt FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'task_files'
    `);

    if (Number(cnt) > 0) {
      console.log('[Migration] task_files existe déjà — rien à faire');
      return;
    }

    await queryRunner.query(`
      CREATE TABLE \`task_files\` (
        \`tasksId\` int NOT NULL,
        \`filesId\` int NOT NULL,
        PRIMARY KEY (\`tasksId\`, \`filesId\`),
        INDEX \`IDX_d3cdaddb7babdc60be38b50e39\` (\`tasksId\`),
        INDEX \`IDX_50468b44cf1e6689fc496a2fdd\` (\`filesId\`),
        CONSTRAINT \`FK_d3cdaddb7babdc60be38b50e390\`
          FOREIGN KEY (\`tasksId\`) REFERENCES \`tasks\` (\`id\`)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`FK_50468b44cf1e6689fc496a2fdda\`
          FOREIGN KEY (\`filesId\`) REFERENCES \`files\` (\`id\`)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[Migration] Table task_files créée');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `task_files`');
  }
}
