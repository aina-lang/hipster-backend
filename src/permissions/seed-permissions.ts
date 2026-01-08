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
  // Dashboard
  { slug: 'view:dashboard', description: 'Voir le tableau de bord' },

  // Employés
  { slug: 'view:employees', description: 'Voir la liste des employés' },
  { slug: 'create:employees', description: 'Ajouter un employé' },
  { slug: 'update:employees', description: 'Modifier un employé' },
  { slug: 'delete:employees', description: 'Supprimer un employé' },

  // Clients
  { slug: 'view:clients', description: 'Voir la liste des clients' },
  { slug: 'create:clients', description: 'Ajouter un client' },
  { slug: 'update:clients', description: 'Modifier un client' },
  { slug: 'delete:clients', description: 'Supprimer un client' },

  // Projets
  { slug: 'view:projects', description: 'Voir la liste des projets' },
  { slug: 'create:projects', description: 'Créer un projet' },
  { slug: 'update:projects', description: 'Modifier un projet' },
  { slug: 'delete:projects', description: 'Supprimer un projet' },

  // Tâches
  { slug: 'view:tasks', description: 'Voir les tâches' },
  { slug: 'create:tasks', description: 'Créer une tâche' },
  { slug: 'update:tasks', description: 'Modifier une tâche' },
  { slug: 'delete:tasks', description: 'Supprimer une tâche' },

  // Factures & Devis
  { slug: 'view:invoices', description: 'Voir les factures' },
  { slug: 'create:invoices', description: 'Créer une facture' },
  { slug: 'update:invoices', description: 'Modifier une facture' },
  { slug: 'delete:invoices', description: 'Supprimer une facture' },

  // Campagnes
  { slug: 'view:campaigns', description: 'Voir les campagnes' },
  { slug: 'create:campaigns', description: 'Créer une campagne' },
  { slug: 'update:campaigns', description: 'Modifier une campagne' },
  { slug: 'delete:campaigns', description: 'Supprimer une campagne' },

  // Support / Tickets
  { slug: 'view:tickets', description: 'Voir les tickets' },
  { slug: 'create:tickets', description: 'Créer un ticket' },
  { slug: 'reply:tickets', description: 'Répondre un ticket' },
  { slug: 'delete:tickets', description: 'Supprimer un ticket' },

  // Paramètres & Admin
  { slug: 'view:settings', description: 'Voir les paramètres' },
  { slug: 'update:settings', description: 'Modifier les paramètres' },
  { slug: 'manage:maintenance', description: 'Gérer la maintenance' },

  // Administration
  { slug: 'view:admins', description: 'Voir les administrateurs' },
  { slug: 'create:admins', description: 'Créer un administrateur' },
  { slug: 'update:admins', description: 'Modifier un administrateur' },
  { slug: 'delete:admins', description: 'Supprimer un administrateur' },
  { slug: 'manage:permissions', description: 'Assigner des permissions' },
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
  console.log(
    `   📊 Total: ${DEFAULT_PERMISSIONS.length} permissions définies\n`,
  );

  return { created, skipped, total: DEFAULT_PERMISSIONS.length };
}

// Si exécuté directement (ts-node)
if (require.main === module) {
  import('typeorm').then(async ({ DataSource }) => {
    // Configuration de la base de données (à adapter selon votre config)
    const dataSource = new DataSource({
      type: 'mysql',
      host: process.env.DB_HOST || '51.178.50.63',
      port: parseInt(process.env.DB_PORT || '3306'),
      username: process.env.DB_USERNAME || 'hipsteruser',
      password: process.env.DB_PASSWORD || 'MotDePasseFort',
      database: process.env.DB_NAME || 'hipsterdb',
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
