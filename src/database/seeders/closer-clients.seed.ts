import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from 'src/data-source';
import { User } from 'src/users/entities/user.entity';
import { Role } from 'src/common/enums/role.enum';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { ClientType } from 'src/common/enums/client.enum';
import { Partner } from 'src/partners/entities/partner.entity';
import { PartnerClient } from 'src/partners/entities/partner-client.entity';
import {
  Deal,
  DealStatus,
  PrestationType,
} from 'src/partners/entities/deal.entity';
import {
  Commission,
  CommissionStatus,
} from 'src/partners/entities/commission.entity';
import {
  Ticket,
  TicketStatus,
  TicketPriority,
} from 'src/tickets/entities/ticket.entity';
import { RequestCategory } from 'src/common/enums/request-category.enum';

/**
 * 🌱 Seed CLIENTS SIGNÉS PAR LES CLOSERS — démontre tout le flux :
 * closer → crée client (compte espace client) → client rattaché au closer
 * d'origine → affaire liée client + closer → demandes futures reconnues.
 *
 * Pré-requis : npm run seed:closers (crée Julien Moreau et Sophie Lambert).
 *
 * Comptes clients créés (mot de passe : client123) :
 *   - antoine.vergne@hipster-clients.fr   (Menuiserie Vergne — closer : Julien)
 *   - lucie.morel@hipster-clients.fr      (Peinture Morel & Fils — closer : Julien)
 *   - marc.blanchet@hipster-clients.fr    (Carrosserie Blanchet — closer : Sophie)
 *
 *   npm run seed:closer-clients
 */
async function seed() {
  const ds = await AppDataSource.initialize();
  console.log('✓ Database connected');

  await ds.synchronize();
  console.log('✓ Schéma synchronisé');

  const userRepo = ds.getRepository(User);
  const profileRepo = ds.getRepository(ClientProfile);
  const partnerRepo = ds.getRepository(Partner);
  const partnerClientRepo = ds.getRepository(PartnerClient);
  const dealRepo = ds.getRepository(Deal);
  const commissionRepo = ds.getRepository(Commission);
  const ticketRepo = ds.getRepository(Ticket);

  const SENTINEL_EMAIL = 'antoine.vergne@hipster-clients.fr';
  if (await userRepo.findOne({ where: { email: SENTINEL_EMAIL } })) {
    console.log('⚠ Données de démo « clients closers » déjà présentes — rien à faire.');
    await ds.destroy();
    return;
  }

  const julien = await partnerRepo.findOne({
    where: { email: 'julien.moreau@hipster-closers.fr' },
  });
  const sophie = await partnerRepo.findOne({
    where: { email: 'sophie.lambert@hipster-closers.fr' },
  });
  if (!julien || !sophie) {
    console.error('✗ Closers introuvables — lancez d\'abord : npm run seed:closers');
    await ds.destroy();
    process.exit(1);
  }

  const password = await bcrypt.hash('client123', 10);

  /** Crée le client complet : compte + profil rattaché au closer + miroir CRM Partners */
  async function createSignedClient(opts: {
    closer: Partner;
    companyName: string;
    firstName: string;
    lastName: string;
    email: string;
    siren: string;
    siret: string;
    phone: string;
    address: string;
  }) {
    const user = await userRepo.save(
      userRepo.create({
        email: opts.email,
        password,
        firstName: opts.firstName,
        lastName: opts.lastName,
        phones: [opts.phone],
        roles: [Role.CLIENT_MARKETING],
        isActive: true,
        isEmailVerified: true,
        clientProfile: {
          companyName: opts.companyName,
          clientType: ClientType.COMPANY,
          siren: opts.siren,
          siret: opts.siret,
          contactEmail: opts.email,
          billingAddress: opts.address,
        } as ClientProfile,
      }),
    );
    const profile = await profileRepo.findOne({
      where: { user: { id: user.id } },
    });
    if (!profile) throw new Error(`Profil non créé pour ${opts.email}`);
    profile.originCloser = opts.closer;
    profile.originCloserId = opts.closer.id;
    await profileRepo.save(profile);

    const partnerClient = await partnerClientRepo.save(
      partnerClientRepo.create({
        name: opts.companyName,
        email: opts.email,
        phone: opts.phone,
        address: opts.address,
        apporteur: opts.closer,
        clientProfileId: profile.id,
      }),
    );
    return { profile, partnerClient };
  }

  // ── Clients de Julien ──
  const vergne = await createSignedClient({
    closer: julien,
    companyName: 'Menuiserie Vergne',
    firstName: 'Antoine',
    lastName: 'Vergne',
    email: SENTINEL_EMAIL,
    siren: '917204563',
    siret: '91720456300012',
    phone: '06 21 43 65 87',
    address: '18 Chemin des Ébénistes, 69400 Villefranche-sur-Saône',
  });
  const morel = await createSignedClient({
    closer: julien,
    companyName: 'Peinture Morel & Fils',
    firstName: 'Lucie',
    lastName: 'Morel',
    email: 'lucie.morel@hipster-clients.fr',
    siren: '842156930',
    siret: '84215693000027',
    phone: '07 65 43 21 09',
    address: '4 Impasse des Coloristes, 38000 Grenoble',
  });
  console.log('✓ 2 clients signés par Julien Moreau (mdp : client123)');

  // ── Client de Sophie ──
  const blanchet = await createSignedClient({
    closer: sophie,
    companyName: 'Carrosserie Blanchet',
    firstName: 'Marc',
    lastName: 'Blanchet',
    email: 'marc.blanchet@hipster-clients.fr',
    siren: '901873245',
    siret: '90187324500018',
    phone: '06 98 12 34 56',
    address: '52 Avenue des Garagistes, 17000 La Rochelle',
  });
  console.log('✓ 1 client signé par Sophie Lambert (mdp : client123)');

  // ── Affaires de suivi liées client + closer (à relancer : pas d'impact commission) ──
  async function mkFollowUpDeal(opts: {
    closer: Partner;
    client: PartnerClient;
    name: string;
    prestation: PrestationType;
    amountHT: number;
    description: string;
  }) {
    const deal = await dealRepo.save(
      dealRepo.create({
        name: opts.name,
        prestationType: opts.prestation,
        description: opts.description,
        amountHT: opts.amountHT,
        status: DealStatus.A_RELANCER,
        client: opts.client,
        apporteur: opts.closer,
      }),
    );
    await commissionRepo.save(
      commissionRepo.create({
        deal: { id: deal.id } as Deal,
        rate: opts.prestation === PrestationType.CONFIGURATEUR ? 0 : 10,
        amount: 0,
        beneficiary: opts.closer,
        status: CommissionStatus.A_CALCULER,
      }),
    );
    return deal;
  }

  await mkFollowUpDeal({
    closer: julien,
    client: vergne.partnerClient,
    name: 'E-commerce — Menuiserie Vergne',
    prestation: PrestationType.ECOMMERCE,
    amountHT: 3900,
    description: 'Boutique en ligne de meubles sur mesure — devis à relancer',
  });
  await mkFollowUpDeal({
    closer: julien,
    client: morel.partnerClient,
    name: 'Logo + charte — Peinture Morel & Fils',
    prestation: PrestationType.LOGO,
    amountHT: 650,
    description: 'Refonte du logo et charte graphique — attend validation du gérant',
  });
  await mkFollowUpDeal({
    closer: sophie,
    client: blanchet.partnerClient,
    name: 'Configurateur devis — Carrosserie Blanchet',
    prestation: PrestationType.CONFIGURATEUR,
    amountHT: 790,
    description: 'Application devis artisan — second RDV à planifier',
  });
  console.log('✓ 3 affaires de suivi créées (statut « À relancer »)');

  // ── Une demande d'un client signé (démo du rattachement) ──
  await ticketRepo.save(
    ticketRepo.create({
      subject: 'Ajouter une galerie de réalisations',
      description:
        'Nous aimerions présenter nos meubles sur mesure dans une galerie photo avec filtres par type de projet.',
      category: RequestCategory.EVOLUTION,
      priority: TicketPriority.MEDIUM,
      status: TicketStatus.OPEN,
      client: vergne.profile,
    }),
  );
  console.log('✓ 1 demande créée par Menuiserie Vergne (closer d\'origine : Julien)');

  await ds.destroy();

  console.log('\n✓ Seed clients closers terminé !');
  console.log('\n══ COMPTES CLIENTS (mot de passe : client123) ══');
  console.log('Menuiserie Vergne      : antoine.vergne@hipster-clients.fr  (closer : Julien Moreau)');
  console.log('Peinture Morel & Fils  : lucie.morel@hipster-clients.fr     (closer : Julien Moreau)');
  console.log('Carrosserie Blanchet   : marc.blanchet@hipster-clients.fr   (closer : Sophie Lambert)');
  console.log('\nÀ voir :');
  console.log('- Espace closer (julien.moreau@hipster-closers.fr / closer123) → « Mes clients »');
  console.log('- Admin → Clients → fiche : « Client créé / signé par : … »');
  console.log('- Connectez un client et envoyez une demande : notifications admin + closer');
}

seed().catch((err) => {
  console.error('Seed clients closers échoué :', err);
  process.exit(1);
});
