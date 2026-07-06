import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from 'src/data-source';
import { User } from 'src/users/entities/user.entity';
import { Role } from 'src/common/enums/role.enum';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { ClientType } from 'src/common/enums/client.enum';
import { Project, ProjectStatus } from 'src/projects/entities/project.entity';
import { Ticket, TicketStatus, TicketPriority } from 'src/tickets/entities/ticket.entity';
import { RequestCategory } from 'src/common/enums/request-category.enum';
import { Invoice, InvoiceType, InvoiceStatus } from 'src/invoices/entities/invoice.entity';
import { InvoiceItem } from 'src/invoices/entities/invoice-item.entity';
import { ClientWebsite } from 'src/profiles/entities/client-website.entity';

async function seed() {
  const dataSource = await AppDataSource.initialize();
  console.log('✓ Database connected');

  const userRepo = dataSource.getRepository(User);
  const clientProfileRepo = dataSource.getRepository(ClientProfile);
  const projectRepo = dataSource.getRepository(Project);
  const ticketRepo = dataSource.getRepository(Ticket);
  const invoiceRepo = dataSource.getRepository(Invoice);
  const invoiceItemRepo = dataSource.getRepository(InvoiceItem);
  const websiteRepo = dataSource.getRepository(ClientWebsite);

  const password = await bcrypt.hash('password123', 10);

  // Clean existing seed data (optional - skip on first run)
  // await ticketRepo.delete({});
  // await invoiceRepo.delete({});
  // await projectRepo.delete({});
  // await websiteRepo.delete({});
  // await clientProfileRepo.delete({});
  // await userRepo.delete({});

  // ──────────────────────────────────────────────
  // 1. ADMIN & EMPLOYEE
  // ──────────────────────────────────────────────
  const admin = userRepo.create({
    email: 'admin@hypster.com',
    password,
    firstName: 'Admin',
    lastName: 'Hypster',
    roles: [Role.ADMIN],
    isActive: true,
    isEmailVerified: true,
  });
  await userRepo.save(admin);
  console.log('✓ Admin created: admin@hypster.com / password123');

  const employee = userRepo.create({
    email: 'employee@hypster.com',
    password,
    firstName: 'Jean',
    lastName: 'Employé',
    roles: [Role.EMPLOYEE],
    isActive: true,
    isEmailVerified: true,
  });
  await userRepo.save(employee);
  console.log('✓ Employee created: employee@hypster.com / password123');

  // ──────────────────────────────────────────────
  // 2. CLIENT 1 — Maintenance active, 3 modifs
  // ──────────────────────────────────────────────
  const client1 = userRepo.create({
    email: 'client.maintenance@hypster.com',
    password,
    firstName: 'Sophie',
    lastName: 'Martin',
    roles: [Role.CLIENT_MARKETING],
    isActive: true,
    isEmailVerified: true,
    clientProfile: {
      companyName: 'Martin SARL',
      clientType: ClientType.COMPANY,
      siret: '12345678901234',
      contactEmail: 'sophie@martin-sarl.fr',
      billingAddress: '12 Rue du Commerce',
      city: 'Lyon',
      zipCode: '69000',
      country: 'France',
    } as ClientProfile,
  });
  const saved1 = await userRepo.save(client1);
  const profile1 = await clientProfileRepo.findOne({
    where: { user: { id: saved1.id } },
  });
  if (!profile1) throw new Error('ClientProfile 1 not found');
  console.log('✓ Client 1 created: client.maintenance@hypster.com / password123');

  // Projects for Client 1
  const project1_1 = projectRepo.create({
    name: 'Site vitrine — Martin SARL',
    description: 'Site vitrine responsive 5 pages avec blog',
    status: ProjectStatus.COMPLETED,
    start_date: new Date('2025-01-15'),
    end_date: new Date('2025-03-20'),
    budget: 2500,
    modifications_restantes: 0,
    maintenance_active: false,
    client: profile1,
  });
  await projectRepo.save(project1_1);

  const project1_2 = projectRepo.create({
    name: 'E-commerce — Martin SARL',
    description: 'Boutique en ligne avec catalogue 200 produits, paiement Stripe',
    status: ProjectStatus.IN_PROGRESS,
    start_date: new Date('2025-06-01'),
    budget: 8500,
    modifications_restantes: 3,
    maintenance_active: true,
    client: profile1,
  });
  await projectRepo.save(project1_2);

  // Tickets for Client 1
  const ticket1_1 = ticketRepo.create({
    subject: 'Page d\'accueil ne s\'affiche pas correctement sur mobile',
    description: 'Le menu burger ne fonctionne pas sur iPhone SE. Les images débordent du conteneur.',
    category: RequestCategory.ANOMALY,
    priority: TicketPriority.HIGH,
    status: TicketStatus.OPEN,
    client: profile1,
    project: project1_2,
  });
  await ticketRepo.save(ticket1_1);

  const ticket1_2 = ticketRepo.create({
    subject: 'Ajouter un filtre par catégorie sur la page produits',
    description: 'Ajouter un système de filtre pour trier les produits par catégorie et par prix.',
    category: RequestCategory.MODIFICATION,
    priority: TicketPriority.MEDIUM,
    status: TicketStatus.OPEN,
    client: profile1,
    project: project1_2,
  });
  await ticketRepo.save(ticket1_2);

  const ticket1_3 = ticketRepo.create({
    subject: 'Création d\'un module de fidélité',
    description: 'Souhaite mettre en place un système de points de fidélité pour les clients réguliers.',
    category: RequestCategory.EVOLUTION,
    priority: TicketPriority.LOW,
    status: TicketStatus.IN_REVIEW,
    client: profile1,
    project: project1_2,
  });
  await ticketRepo.save(ticket1_3);

  // Invoices for Client 1
  const invoice1_1 = invoiceRepo.create({
    reference: 'DEV-2025-001',
    type: InvoiceType.QUOTE,
    status: InvoiceStatus.ACCEPTED,
    amount: 2500,
    subTotal: 2500,
    taxRate: 20,
    taxAmount: 500,
    issueDate: new Date('2025-01-10'),
    client: profile1,
    project: project1_1,
  });
  await invoiceRepo.save(invoice1_1);

  const invoice1_2 = invoiceRepo.create({
    reference: 'FAC-2025-001',
    type: InvoiceType.INVOICE,
    status: InvoiceStatus.PAID,
    amount: 2500,
    subTotal: 2500,
    taxRate: 20,
    taxAmount: 500,
    issueDate: new Date('2025-04-01'),
    paymentDate: new Date('2025-04-15'),
    client: profile1,
    project: project1_1,
  });
  await invoiceRepo.save(invoice1_2);

  const invoice1_3 = invoiceRepo.create({
    reference: 'DEV-2025-002',
    type: InvoiceType.QUOTE,
    status: InvoiceStatus.PENDING,
    amount: 8500,
    subTotal: 8500,
    taxRate: 20,
    taxAmount: 1700,
    issueDate: new Date('2025-05-20'),
    client: profile1,
    project: project1_2,
  });
  await invoiceRepo.save(invoice1_3);

  // WordPress access for Client 1
  const website1 = websiteRepo.create({
    url: 'https://ecommerce.martin-sarl.fr/wp-admin',
    adminLogin: 'sophie.martin',
    adminPassword: 'wp_secret_2025',
    plainPassword: 'wp_secret_2025',
    description: 'Site e-commerce — Accès administrateur WordPress',
    client: profile1,
  });
  await websiteRepo.save(website1);

  console.log('✓ Client 1 data seeded (projects, tickets, invoices, website)');

  // ──────────────────────────────────────────────
  // 3. CLIENT 2 — Maintenance inactive, 2 modifs
  // ──────────────────────────────────────────────
  const client2 = userRepo.create({
    email: 'client.nomaintenance@hypster.com',
    password,
    firstName: 'Pierre',
    lastName: 'Dupont',
    roles: [Role.CLIENT_MARKETING],
    isActive: true,
    isEmailVerified: true,
    clientProfile: {
      companyName: 'Dupont Indiv.',
      clientType: ClientType.INDIVIDUAL,
      contactEmail: 'pierre@dupont.fr',
      billingAddress: '8 Rue des Lilas',
      city: 'Paris',
      zipCode: '75000',
      country: 'France',
    } as ClientProfile,
  });
  await userRepo.save(client2);
  const profile2 = await clientProfileRepo.findOne({ where: { user: { id: client2.id } } });
  console.log('✓ Client 2 created: client.nomaintenance@hypster.com / password123');

  const project2_1 = projectRepo.create({
    name: 'Blog personnel — Dupont',
    description: 'Blog culinaire avec recettes et galerie photos',
    status: ProjectStatus.PENDING,
    start_date: new Date('2025-07-01'),
    budget: 1800,
    modifications_restantes: 2,
    maintenance_active: false,
    client: profile2,
  });
  await projectRepo.save(project2_1);

  const ticket2_1 = ticketRepo.create({
    subject: 'Ajouter une section "Recettes saisonnières"',
    description: 'Créer une page dédiée aux recettes de saison avec mise en avant automatique.',
    category: RequestCategory.MODIFICATION,
    priority: TicketPriority.MEDIUM,
    status: TicketStatus.OPEN,
    client: profile2,
    project: project2_1,
  });
  await ticketRepo.save(ticket2_1);

  const invoice2_1 = invoiceRepo.create({
    reference: 'DEV-2025-003',
    type: InvoiceType.QUOTE,
    status: InvoiceStatus.PENDING,
    amount: 1800,
    subTotal: 1800,
    taxRate: 20,
    taxAmount: 360,
    issueDate: new Date('2025-06-15'),
    client: profile2,
    project: project2_1,
  });
  await invoiceRepo.save(invoice2_1);

  console.log('✓ Client 2 data seeded');

  // ──────────────────────────────────────────────
  // 4. CLIENT 3 — 0 modifications restantes
  // ──────────────────────────────────────────────
  const client3 = userRepo.create({
    email: 'client.nomodif@hypster.com',
    password,
    firstName: 'Julie',
    lastName: 'Bernard',
    roles: [Role.CLIENT_MARKETING],
    isActive: true,
    isEmailVerified: true,
    clientProfile: {
      companyName: 'Bernard Créations',
      clientType: ClientType.COMPANY,
      siret: '98765432109876',
      contactEmail: 'julie@bernard-creations.fr',
      billingAddress: '5 Avenue des Arts',
      city: 'Marseille',
      zipCode: '13000',
      country: 'France',
    } as ClientProfile,
  });
  await userRepo.save(client3);
  const profile3 = await clientProfileRepo.findOne({ where: { user: { id: client3.id } } });
  console.log('✓ Client 3 created: client.nomodif@hypster.com / password123');

  const project3_1 = projectRepo.create({
    name: 'Application mobile — Bernard Créations',
    description: 'App Flutter de réservation de services créatifs',
    status: ProjectStatus.PLANNED,
    start_date: new Date('2025-08-01'),
    budget: 15000,
    modifications_restantes: 0,
    maintenance_active: true,
    client: profile3,
  });
  await projectRepo.save(project3_1);

  const ticket3_1 = ticketRepo.create({
    subject: 'Ajouter un module de chat en direct',
    description: 'Intégrer une messagerie instantanée entre les clients et les créateurs.',
    category: RequestCategory.EVOLUTION,
    priority: TicketPriority.HIGH,
    status: TicketStatus.OPEN,
    client: profile3,
    project: project3_1,
  });
  await ticketRepo.save(ticket3_1);

  const invoice3_1 = invoiceRepo.create({
    reference: 'DEV-2025-004',
    type: InvoiceType.QUOTE,
    status: InvoiceStatus.DRAFT,
    amount: 15000,
    subTotal: 15000,
    taxRate: 20,
    taxAmount: 3000,
    issueDate: new Date('2025-07-10'),
    client: profile3,
    project: project3_1,
  });
  await invoiceRepo.save(invoice3_1);

  const website3 = websiteRepo.create({
    url: 'https://bernard-creations.fr/wp-admin',
    adminLogin: 'julie.bernard',
    adminPassword: 'wp_admin_2025',
    plainPassword: 'wp_admin_2025',
    description: 'Site principal — Accès WordPress',
    client: profile3,
  });
  await websiteRepo.save(website3);

  console.log('✓ Client 3 data seeded');

  await dataSource.destroy();
  console.log('\n✓ Seed completed successfully!');
  console.log('\n── Test accounts ──');
  console.log('Admin:   admin@hypster.com / password123');
  console.log('Employee: employee@hypster.com / password123');
  console.log('Client 1 (maintenance + modifs): client.maintenance@hypster.com / password123');
  console.log('Client 2 (no maintenance):   client.nomaintenance@hypster.com / password123');
  console.log('Client 3 (0 modifs left):    client.nomodif@hypster.com / password123');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
