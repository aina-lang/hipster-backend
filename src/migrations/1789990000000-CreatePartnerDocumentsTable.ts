import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crée la table `partner_documents` (documents attachés à la fiche d'un
 * partenaire — contrat, RIB...), distincte de `deal_documents` qui s'attache
 * à une affaire. Sur les bases où `synchronize` est désactivé, elle n'existe
 * pas tant que cette migration n'a pas tourné : la fiche partenaire ne
 * proposerait alors aucun document.
 *
 * Le DDL reprend exactement celui que TypeORM génère — noms de contraintes
 * compris — pour qu'une synchronisation ultérieure reconnaisse la table
 * comme conforme au lieu de vouloir la recréer. Vérifié en local : le
 * `SHOW CREATE TABLE` résultant est identique à celui produit par
 * synchronize.
 */
export class CreatePartnerDocumentsTable1789990000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const [{ cnt }] = await queryRunner.query(`
      SELECT COUNT(*) as cnt FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'partner_documents'
    `);

    if (Number(cnt) > 0) {
      console.log('[Migration] partner_documents existe déjà — rien à faire');
      return;
    }

    await queryRunner.query(`
      CREATE TABLE \`partner_documents\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`type\` enum('contrat','document_utile') NOT NULL DEFAULT 'document_utile',
        \`originalName\` varchar(255) NOT NULL,
        \`filename\` varchar(255) NOT NULL,
        \`url\` varchar(255) NOT NULL,
        \`mimeType\` varchar(255) DEFAULT NULL,
        \`size\` int DEFAULT NULL,
        \`uploadedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`partnerId\` int DEFAULT NULL,
        \`uploadedById\` int DEFAULT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`FK_feed69b0339f73a6e5919c0ac65\` (\`partnerId\`),
        KEY \`FK_97b1c951caa34f2e634e7e6a12b\` (\`uploadedById\`),
        CONSTRAINT \`FK_97b1c951caa34f2e634e7e6a12b\`
          FOREIGN KEY (\`uploadedById\`) REFERENCES \`users\` (\`id\`)
          ON DELETE SET NULL ON UPDATE NO ACTION,
        CONSTRAINT \`FK_feed69b0339f73a6e5919c0ac65\`
          FOREIGN KEY (\`partnerId\`) REFERENCES \`partners\` (\`id\`)
          ON DELETE CASCADE ON UPDATE NO ACTION
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[Migration] Table partner_documents créée');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `partner_documents`');
  }
}
