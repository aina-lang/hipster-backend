import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { Like } from 'typeorm';
import { AppDataSource } from 'src/data-source';
import { User } from 'src/users/entities/user.entity';
import { Role } from 'src/common/enums/role.enum';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { ClientType } from 'src/common/enums/client.enum';
import { ClientWebsite } from 'src/profiles/entities/client-website.entity';
import { Project, ProjectStatus } from 'src/projects/entities/project.entity';
import {
  Ticket,
  TicketStatus,
  TicketPriority,
} from 'src/tickets/entities/ticket.entity';
import { RequestCategory } from 'src/common/enums/request-category.enum';
import {
  Invoice,
  InvoiceType,
  InvoiceStatus,
} from 'src/invoices/entities/invoice.entity';
import { Task, TaskStatus, TaskPriority } from 'src/tasks/entities/task.entity';

/**
 * 🌱 Seed CLIENTS complet — comptes clients avec accès portail, profils,
 * projets, sites web (login/mdp en clair), devis/factures, tickets ET
 * maintenance complète (projet global « Maintenance Sites Web » + une tâche
 * par site, tarifs mensuels, dernière maintenance effectuée).
 *
 * Comptes créés (mot de passe : client123) :
 *   - marc.dubois@hipster-clients.fr    (client principal, 3 projets, 2 sites en maintenance)
 *   - nathalie.petit@hipster-clients.fr (2e client, 1 projet, 1 site en maintenance)
 *
 *   npm run seed:clients
 */

const MAINTENANCE_PROJECT_NAME = 'Maintenance Sites Web';

async function seed() {
  const ds = await AppDataSource.initialize();
  console.log('✓ Database connected');

  await ds.synchronize();
  console.log('✓ Schéma synchronisé');

  const userRepo = ds.getRepository(User);
  const profileRepo = ds.getRepository(ClientProfile);
  const websiteRepo = ds.getRepository(ClientWebsite);
  const projectRepo = ds.getRepository(Project);
  const ticketRepo = ds.getRepository(Ticket);
  const invoiceRepo = ds.getRepository(Invoice);
  const taskRepo = ds.getRepository(Task);

  const SENTINEL_EMAIL = 'marc.dubois@hipster-clients.fr';
  const existing = await userRepo.findOne({ where: { email: SENTINEL_EMAIL } });
  if (existing) {
    console.log('⚠ Données de démo Clients déjà présentes — rien à faire.');
    console.log('  Login : marc.dubois@hipster-clients.fr / client123');
    await ds.destroy();
    return;
  }

  const password = await bcrypt.hash('client123', 10);
  const now = new Date();
  const daysAgo = (n: number) =>
    new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  // ────────────────────────────────────────────────────────────
  // CLIENT 1 — Marc Dubois / Dubois Rénovation (le plus complet)
  // ────────────────────────────────────────────────────────────
  const marc = await userRepo.save(
    userRepo.create({
      email: SENTINEL_EMAIL,
      password,
      firstName: 'Marc',
      lastName: 'Dubois',
      phones: ['06 45 12 89 33', '04 72 18 45 60'],
      roles: [Role.CLIENT_MARKETING],
      isActive: true,
      isEmailVerified: true,
      clientProfile: {
        companyName: 'Dubois Rénovation',
        clientType: ClientType.COMPANY,
        siret: '84512397600014',
        tvaNumber: 'FR32845123976',
        website: 'https://dubois-renovation.fr',
        contactEmail: 'contact@dubois-renovation.fr',
        billingAddress: '24 Rue des Artisans',
        city: 'Lyon',
        zipCode: '69003',
        country: 'France',
      } as ClientProfile,
    }),
  );
  const marcProfile = await profileRepo.findOne({
    where: { user: { id: marc.id } },
  });
  if (!marcProfile) throw new Error('Profil client Marc introuvable');
  console.log('✓ Client 1 créé : marc.dubois@hipster-clients.fr / client123');

  // ── Projets ──
  const siteVitrine = await projectRepo.save(
    projectRepo.create({
      name: 'Site vitrine — Dubois Rénovation',
      description:
        'Site vitrine 6 pages : accueil, prestations, réalisations (galerie avant/après), avis clients, devis en ligne, contact',
      status: ProjectStatus.COMPLETED,
      start_date: daysAgo(180),
      end_date: daysAgo(120),
      budget: 2400,
      progress: 100,
      modifications_restantes: 2,
      maintenance_active: true,
      client: marcProfile,
    }),
  );
  const ecommerce = await projectRepo.save(
    projectRepo.create({
      name: 'Boutique matériaux — Dubois Rénovation',
      description:
        'Boutique en ligne de matériaux de rénovation : catalogue 150 produits, paiement Stripe, click & collect',
      status: ProjectStatus.IN_PROGRESS,
      start_date: daysAgo(45),
      budget: 7200,
      progress: 60,
      modifications_restantes: 3,
      maintenance_active: true,
      client: marcProfile,
    }),
  );
  const appDevis = await projectRepo.save(
    projectRepo.create({
      name: 'Configurateur devis — Dubois Rénovation',
      description:
        'Application de devis en ligne pour les chantiers de rénovation (configurateur devis artisan)',
      status: ProjectStatus.PENDING,
      start_date: daysAgo(5),
      budget: 790,
      progress: 0,
      modifications_restantes: 3,
      maintenance_active: false,
      client: marcProfile,
    }),
  );

  // ── Sites web (login / mot de passe en clair + tarif maintenance) ──
  const siteDubois = await websiteRepo.save(
    websiteRepo.create({
      url: 'https://dubois-renovation.fr/wp-admin',
      adminLogin: 'marc.dubois',
      adminPassword: 'Dubois!Wp2026',
      plainPassword: 'Dubois!Wp2026',
      description: 'Site vitrine WordPress — accès administrateur',
      client: marcProfile,
      maintenancePrice: 49,
      maintenanceNotes: 'Forfait maintenance standard — sauvegardes + mises à jour hebdo',
      lastMaintenanceDate: daysAgo(6),
    }),
  );
  const siteBoutique = await websiteRepo.save(
    websiteRepo.create({
      url: 'https://boutique.dubois-renovation.fr/wp-admin',
      adminLogin: 'admin_boutique',
      adminPassword: 'Boutik#2026!',
      plainPassword: 'Boutik#2026!',
      description: 'Boutique WooCommerce — accès administrateur',
      client: marcProfile,
      maintenancePrice: 89,
      maintenanceNotes: 'Forfait e-commerce — surveillance paiements + stock + MAJ plugins',
    }),
  );

  // ── Devis & factures (alimentent le CA de la fiche client) ──
  const mkInvoice = (data: Partial<Invoice>) =>
    invoiceRepo.save(invoiceRepo.create(data as Invoice));

  await mkInvoice({
    reference: 'DEV-2603-101',
    type: InvoiceType.QUOTE,
    status: InvoiceStatus.ACCEPTED,
    amount: 2400,
    issueDate: daysAgo(190),
    client: marcProfile,
    project: siteVitrine,
    notes: 'Devis site vitrine accepté',
  });
  await mkInvoice({
    reference: 'FAC-2604-101',
    type: InvoiceType.INVOICE,
    status: InvoiceStatus.PAID,
    amount: 2400,
    issueDate: daysAgo(115),
    paymentDate: daysAgo(100),
    client: marcProfile,
    project: siteVitrine,
  });
  await mkInvoice({
    reference: 'DEV-2607-102',
    type: InvoiceType.QUOTE,
    status: InvoiceStatus.ACCEPTED,
    amount: 7200,
    issueDate: daysAgo(55),
    client: marcProfile,
    project: ecommerce,
  });
  await mkInvoice({
    reference: 'FAC-2608-102',
    type: InvoiceType.INVOICE,
    status: InvoiceStatus.PAID,
    amount: 3600,
    issueDate: daysAgo(40),
    paymentDate: daysAgo(35),
    client: marcProfile,
    project: ecommerce,
    notes: 'Acompte 50 % boutique',
  });
  await mkInvoice({
    reference: 'FAC-2609-103',
    type: InvoiceType.INVOICE,
    status: InvoiceStatus.PENDING,
    amount: 3600,
    issueDate: daysAgo(3),
    dueDate: new Date(now.getTime() + 27 * 24 * 60 * 60 * 1000),
    client: marcProfile,
    project: ecommerce,
    notes: 'Solde boutique à la livraison',
  });
  await mkInvoice({
    reference: 'DEV-2609-104',
    type: InvoiceType.QUOTE,
    status: InvoiceStatus.PENDING,
    amount: 790,
    issueDate: daysAgo(4),
    client: marcProfile,
    project: appDevis,
    notes: 'Devis configurateur en attente de signature',
  });

  // ── Tickets ──
  await ticketRepo.save(
    ticketRepo.create({
      subject: 'Galerie avant/après lente sur mobile',
      description:
        'La page réalisations met plus de 6 secondes à charger sur 4G. Les photos ne semblent pas compressées.',
      category: RequestCategory.ANOMALY,
      priority: TicketPriority.HIGH,
      status: TicketStatus.OPEN,
      client: marcProfile,
      project: siteVitrine,
    }),
  );
  await ticketRepo.save(
    ticketRepo.create({
      subject: 'Modifier les horaires en pied de page',
      description:
        'Nouveaux horaires : lundi-vendredi 7h30-18h30, samedi 8h-12h. À mettre à jour sur toutes les pages.',
      category: RequestCategory.MODIFICATION,
      priority: TicketPriority.LOW,
      status: TicketStatus.IN_REVIEW,
      client: marcProfile,
      project: siteVitrine,
    }),
  );
  await ticketRepo.save(
    ticketRepo.create({
      subject: 'Ajouter le paiement en 3 fois sur la boutique',
      description:
        'Souhaite proposer le paiement en 3 fois sans frais pour les paniers de plus de 500 €.',
      category: RequestCategory.EVOLUTION,
      priority: TicketPriority.MEDIUM,
      status: TicketStatus.OPEN,
      client: marcProfile,
      project: ecommerce,
    }),
  );

  console.log('✓ Client 1 : 3 projets, 2 sites, 6 devis/factures, 3 tickets');

  // ────────────────────────────────────────────────────────────
  // CLIENT 2 — Nathalie Petit / Institut Zen
  // ────────────────────────────────────────────────────────────
  const nathalie = await userRepo.save(
    userRepo.create({
      email: 'nathalie.petit@hipster-clients.fr',
      password,
      firstName: 'Nathalie',
      lastName: 'Petit',
      phones: ['07 82 44 51 26'],
      roles: [Role.CLIENT_MARKETING],
      isActive: true,
      isEmailVerified: true,
      clientProfile: {
        companyName: 'Institut Zen',
        clientType: ClientType.COMPANY,
        siret: '91234567800021',
        contactEmail: 'bonjour@institut-zen.fr',
        billingAddress: '3 Place du Marché',
        city: 'Annecy',
        zipCode: '74000',
        country: 'France',
      } as ClientProfile,
    }),
  );
  const nathalieProfile = await profileRepo.findOne({
    where: { user: { id: nathalie.id } },
  });
  if (!nathalieProfile) throw new Error('Profil client Nathalie introuvable');
  console.log('✓ Client 2 créé : nathalie.petit@hipster-clients.fr / client123');

  const siteZenProject = await projectRepo.save(
    projectRepo.create({
      name: 'Site + réservation — Institut Zen',
      description:
        'Site vitrine avec module de réservation de soins en ligne et paiement des acomptes',
      status: ProjectStatus.COMPLETED,
      start_date: daysAgo(90),
      end_date: daysAgo(30),
      budget: 2400,
      progress: 100,
      modifications_restantes: 1,
      maintenance_active: true,
      client: nathalieProfile,
    }),
  );
  const siteZen = await websiteRepo.save(
    websiteRepo.create({
      url: 'https://institut-zen.fr/wp-admin',
      adminLogin: 'nathalie.zen',
      adminPassword: 'Zen&Spa-2026',
      plainPassword: 'Zen&Spa-2026',
      description: 'Site vitrine + réservation — accès WordPress',
      client: nathalieProfile,
      maintenancePrice: 39,
      maintenanceNotes: 'Forfait essentiel — MAJ mensuelles + sauvegardes',
      lastMaintenanceDate: daysAgo(40),
    }),
  );
  await mkInvoice({
    reference: 'FAC-2607-201',
    type: InvoiceType.INVOICE,
    status: InvoiceStatus.PAID,
    amount: 2400,
    issueDate: daysAgo(28),
    paymentDate: daysAgo(20),
    client: nathalieProfile,
    project: siteZenProject,
  });
  await ticketRepo.save(
    ticketRepo.create({
      subject: 'Bloquer les réservations les jours fériés',
      description:
        'Le calendrier de réservation propose des créneaux les jours fériés, il faut les bloquer automatiquement.',
      category: RequestCategory.MODIFICATION,
      priority: TicketPriority.MEDIUM,
      status: TicketStatus.OPEN,
      client: nathalieProfile,
      project: siteZenProject,
    }),
  );

  console.log('✓ Client 2 : 1 projet, 1 site, 1 facture, 1 ticket');

  // ────────────────────────────────────────────────────────────
  // MAINTENANCE — projet global + une tâche par site
  // (même logique que MaintenanceService.getOrCreateMaintenanceProject)
  // ────────────────────────────────────────────────────────────
  let maintenance = await projectRepo.findOne({
    where: { name: Like(`${MAINTENANCE_PROJECT_NAME}%`) },
    order: { createdAt: 'ASC' },
  });
  if (!maintenance) {
    maintenance = await projectRepo.save(
      projectRepo.create({
        name: MAINTENANCE_PROJECT_NAME,
        description:
          'Projet global de maintenance des sites WordPress de tous les clients',
        start_date: new Date(),
        status: ProjectStatus.IN_PROGRESS,
        budget: 0,
        maintenanceConfig: { enabled: true, frequency: 'custom' },
        recurrenceType: 'weekly',
        recurrenceDays: ['monday'],
      }),
    );
    console.log('✓ Projet global « Maintenance Sites Web » créé');
  }

  const mkMaintenanceTask = async (
    website: ClientWebsite,
    clientName: string,
    status: TaskStatus,
  ) => {
    const already = await taskRepo.findOne({
      where: { websiteId: website.id, project: { id: maintenance!.id } },
    });
    if (already) return already;
    return taskRepo.save(
      taskRepo.create({
        title: `${website.url} - ${clientName}`,
        description: `Maintenance du site WordPress\nURL: ${website.url}\nLogin: ${website.adminLogin}\nPassword: ${website.plainPassword || '[Non défini]'}\nClient: ${clientName}`,
        status,
        priority: TaskPriority.MEDIUM,
        project: maintenance!,
        websiteId: website.id,
        recurrenceType: maintenance!.recurrenceType,
        recurrenceInterval: maintenance!.recurrenceInterval,
        recurrenceDays: maintenance!.recurrenceDays,
      }),
    );
  };

  // Vitrine Dubois : maintenance faite il y a 6 jours → tâche terminée
  await mkMaintenanceTask(siteDubois, 'Marc Dubois', TaskStatus.DONE);
  // Boutique Dubois : jamais maintenue → à faire
  await mkMaintenanceTask(siteBoutique, 'Marc Dubois', TaskStatus.TODO);
  // Institut Zen : dernière maintenance il y a 40 jours → en retard, à faire
  await mkMaintenanceTask(siteZen, 'Nathalie Petit', TaskStatus.TODO);

  console.log('✓ Maintenance : 3 sites suivis (1 fait, 2 à faire) — tarifs 49/89/39 €/mois');

  await ds.destroy();

  console.log('\n✓ Seed Clients terminé !');
  console.log('\n══ COMPTES CLIENTS (mot de passe : client123) ══');
  console.log('Client principal : marc.dubois@hipster-clients.fr');
  console.log('                   Dubois Rénovation — 3 projets, 2 sites (mdp en clair),');
  console.log('                   6 devis/factures (6 000 € payés, 3 600 € en attente), 3 tickets');
  console.log('2e client        : nathalie.petit@hipster-clients.fr');
  console.log('                   Institut Zen — 1 projet, 1 site, 1 facture payée, 1 ticket');
  console.log('\n══ MAINTENANCE ══');
  console.log('Projet « Maintenance Sites Web » : 3 sites suivis');
  console.log('  - dubois-renovation.fr        49 €/mois — maintenance faite (tâche DONE)');
  console.log('  - boutique.dubois-renovation  89 €/mois — à faire');
  console.log('  - institut-zen.fr             39 €/mois — en retard (40 jours), à faire');
  console.log('Récurrent mensuel maintenance : 177 € HT');
}

seed().catch((err) => {
  console.error('Seed Clients échoué :', err);
  process.exit(1);
});
