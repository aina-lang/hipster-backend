import { DataSource } from 'typeorm';
import { Permission } from './entities/permission.entity';

/**
 * Script de génération des permissions par défaut pour tous les modules
 * 
 * Usage:
 * - Créer un script dans package.json: "seed:permissions": "ts-node src/permissions/seed-permissions.ts"
 * - Ou l'exécuter via une commande NestJS
 */

interface PermissionDefinition {
  slug: string;
  description: string;
}

// Définition de toutes les permissions par module
const DEFAULT_PERMISSIONS: PermissionDefinition[] = [
  { slug: 'manage:employees', description: 'Gestion des employés' },
  { slug: 'manage:clients', description: 'Gestion des clients' },
  { slug: 'manage:projects', description: 'Gestion des projets' },
  { slug: 'manage:support', description: 'Gestion du support' },
  { slug: 'manage:invoices', description: 'Gestion des devis et factures' },
  { slug: 'manage:campaigns', description: 'Gestion des campagnes' },
  { slug: 'manage:settings', description: 'Paramètres de l\'entreprise' },
];

export async function seedPermissions(dataSource: DataSource) {
  const permissionRepository = dataSource.getRepository(Permission);

  console.log('🌱 Début du seeding des permissions...');

  let created = 0;
  let skipped = 0;

  for (const perm of DEFAULT_PERMISSIONS) {
    // Vérifier si la permission existe déjà
    const existing = await permissionRepository.findOne({
      where: { slug: perm.slug },
    });

    if (existing) {
      console.log(`⏭️  Permission "${perm.slug}" existe déjà, ignorée`);
      skipped++;
      continue;
    }

    // Créer la permission
    const permission = permissionRepository.create({
      slug: perm.slug,
      description: perm.description,
    });

    await permissionRepository.save(permission);
    console.log(`✅ Permission créée: ${perm.slug} - ${perm.description}`);
    created++;
  }

  console.log(`\n✨ Seeding terminé!`);
  console.log(`   ✅ ${created} permissions créées`);
  console.log(`   ⏭️  ${skipped} permissions ignorées (déjà existantes)`);
  console.log(`   📊 Total: ${DEFAULT_PERMISSIONS.length} permissions définies\n`);

  return { created, skipped, total: DEFAULT_PERMISSIONS.length };
}

// Si exécuté directement (ts-node)
if (require.main === module) {
  import('typeorm').then(async ({ DataSource }) => {
    // Configuration de la base de données (à adapter selon votre config)
    const dataSource = new DataSource({
      type: 'mysql',
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '3306'),
      username: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'hipster',
      entities: [Permission],
      synchronize: false,
    });

    try {
      await dataSource.initialize();
      await seedPermissions(dataSource);
      await dataSource.destroy();
      process.exit(0);
    } catch (error) {
      console.error('❌ Erreur lors du seeding:', error);
      process.exit(1);
    }
  });
}

