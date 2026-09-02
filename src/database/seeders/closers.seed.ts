import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from 'src/data-source';
import { User } from 'src/users/entities/user.entity';
import { Role } from 'src/common/enums/role.enum';
import { Partner, PartnerType } from 'src/partners/entities/partner.entity';
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

/**
 * 🌱 Seed CRM Closers — données réalistes pour tester tout le fonctionnement :
 * statuts de RDV, commission 10 % sites, paliers configurateur (200/225/250 €),
 * tableau de bord closer et page admin « Résultats closers » (mois courant + mois précédent).
 *
 * Comptes créés (mot de passe : closer123) :
 *   - julien.moreau@hipster-closers.fr  (closer principal, 7 ventes configurateur → 3 paliers)
 *   - sophie.lambert@hipster-closers.fr (2e closer pour le total équipe)
 *
 *   npm run seed:closers
 */

const CONFIG_PRICE = 790;
const tierAmount = (rank: number) => (rank <= 3 ? 200 : rank <= 6 ? 225 : 250);

async function seed() {
  const ds = await AppDataSource.initialize();
  console.log('✓ Database connected');

  // S'assure que le schéma est à jour (colonnes type / signedAt / saleRank)
  await ds.synchronize();
  console.log('✓ Schéma synchronisé');

  const userRepo = ds.getRepository(User);
  const partnerRepo = ds.getRepository(Partner);
  const clientRepo = ds.getRepository(PartnerClient);
  const dealRepo = ds.getRepository(Deal);
  const commissionRepo = ds.getRepository(Commission);

  const SENTINEL_EMAIL = 'julien.moreau@hipster-closers.fr';
  const existing = await partnerRepo.findOne({ where: { email: SENTINEL_EMAIL } });
  if (existing) {
    console.log('⚠ Données de démo Closers déjà présentes — rien à faire.');
    console.log('  Login : julien.moreau@hipster-closers.fr / closer123');
    await ds.destroy();
    return;
  }

  const password = await bcrypt.hash('closer123', 10);

  async function createCloser(opts: {
    name: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    zone: string;
  }): Promise<Partner> {
    let user = await userRepo.findOne({ where: { email: opts.email } });
    if (!user) {
      user = await userRepo.save(
        userRepo.create({
          email: opts.email,
          password,
          firstName: opts.firstName,
          lastName: opts.lastName,
          roles: [Role.PARTNER],
          isActive: true,
          isEmailVerified: true,
        }),
      );
    }
    return partnerRepo.save(
      partnerRepo.create({
        agencyName: opts.name,
        type: PartnerType.CLOSER,
        contactName: opts.name,
        email: opts.email,
        phone: opts.phone,
        speciality: 'Closing',
        geographicZone: opts.zone,
        isActive: true,
        hasPortalAccess: true,
        user: { id: user.id } as User,
      }),
    );
  }

  // ── 1. Closers ──
  const julien = await createCloser({
    name: 'Julien Moreau',
    email: SENTINEL_EMAIL,
    firstName: 'Julien',
    lastName: 'Moreau',
    phone: '06 12 34 56 78',
    zone: 'National',
  });
  const sophie = await createCloser({
    name: 'Sophie Lambert',
    email: 'sophie.lambert@hipster-closers.fr',
    firstName: 'Sophie',
    lastName: 'Lambert',
    phone: '06 98 76 54 32',
    zone: 'National',
  });
  console.log('✓ 2 closers créés (mot de passe : closer123)');

  // ── 2. Clients artisans (prospects du phoning) ──
  const mkClient = (name: string, city: string, apporteur: Partner) =>
    clientRepo.save(
      clientRepo.create({
        name,
        email: `contact@${name.toLowerCase().replace(/[^a-z]/g, '')}.fr`,
        phone: `06 ${Math.floor(10000000 + Math.random() * 89999999).toString().replace(/(\d{2})(?=\d)/g, '$1 ')}`,
        address: city,
        apporteur,
      }),
    );

  // Dates du mois courant (jour clampé à aujourd'hui, heure = ordre chronologique)
  const now = new Date();
  const day = (d: number, hour: number) =>
    new Date(now.getFullYear(), now.getMonth(), Math.min(d, now.getDate()), hour, 0, 0);
  // Mois précédent
  const prevDay = (d: number, hour: number) =>
    new Date(now.getFullYear(), now.getMonth() - 1, d, hour, 0, 0);

  // ── 3. Affaires + commissions selon les règles closers ──
  async function mkCloserDeal(opts: {
    closer: Partner;
    clientName: string;
    city: string;
    dealName: string;
    prestation: PrestationType;
    amountHT: number;
    status: DealStatus;
    signedAt?: Date;
    /** Rang de la vente configurateur dans SON mois (paliers non rétroactifs) */
    rank?: number;
    description?: string;
  }) {
    const client = await mkClient(opts.clientName, opts.city, opts.closer);
    const signed = opts.status === DealStatus.RDV_SIGNE;
    const isConfig = opts.prestation === PrestationType.CONFIGURATEUR;

    const deal = await dealRepo.save(
      dealRepo.create({
        name: opts.dealName,
        prestationType: opts.prestation,
        description: opts.description,
        amountHT: opts.amountHT,
        status: opts.status,
        signedAt: signed ? opts.signedAt || new Date() : null,
        client,
        apporteur: opts.closer,
        realisateur: undefined, // Hipster Marketing réalise
      }),
    );

    const amount = !signed
      ? 0
      : isConfig
      ? tierAmount(opts.rank || 1)
      : Math.round(opts.amountHT * 10) / 100;

    await commissionRepo.save(
      commissionRepo.create({
        deal: { id: deal.id } as Deal,
        rate: isConfig ? 0 : 10,
        saleRank: signed && isConfig ? opts.rank || 1 : null,
        amount,
        beneficiary: opts.closer,
        status: signed ? CommissionStatus.A_PAYER : CommissionStatus.A_CALCULER,
        dueDate: signed ? opts.signedAt || new Date() : null,
      }),
    );
    return deal;
  }

  const CONFIG = PrestationType.CONFIGURATEUR;
  const SITE = PrestationType.SITE_INTERNET;

  // ══ JULIEN — mois courant : 7 ventes configurateur (paliers 200→225→250) + 2 sites ══
  const julienConfigSales = [
    { client: 'Plomberie Girard', city: 'Bordeaux', d: 2 },
    { client: "Élec' Bernard", city: 'Toulouse', d: 4 },
    { client: 'Menuiserie Fabre', city: 'Nantes', d: 7 },
    { client: 'Maçonnerie Costa', city: 'Lille', d: 10 },
    { client: 'Peinture Dias', city: 'Rennes', d: 13 },
    { client: 'Couverture Roux', city: 'Strasbourg', d: 16 },
    { client: 'Chauffage Petit', city: 'Dijon', d: 19 },
  ];
  for (let i = 0; i < julienConfigSales.length; i++) {
    const s = julienConfigSales[i];
    await mkCloserDeal({
      closer: julien,
      clientName: s.client,
      city: s.city,
      dealName: `Configurateur devis — ${s.client}`,
      prestation: CONFIG,
      amountHT: CONFIG_PRICE,
      status: DealStatus.RDV_SIGNE,
      signedAt: day(s.d, 9 + i),
      rank: i + 1,
      description: 'Application devis artisan — vente RDV phoning',
    });
  }

  await mkCloserDeal({
    closer: julien,
    clientName: 'Boucherie Delmas',
    city: 'Lyon',
    dealName: 'Site vitrine — Boucherie Delmas',
    prestation: SITE,
    amountHT: 1500,
    status: DealStatus.RDV_SIGNE,
    signedAt: day(5, 17),
    description: 'Site vitrine 5 pages + fiche Google',
  });
  await mkCloserDeal({
    closer: julien,
    clientName: 'Institut Belle Vie',
    city: 'Annecy',
    dealName: 'Site + réservation — Institut Belle Vie',
    prestation: SITE,
    amountHT: 2400,
    status: DealStatus.RDV_SIGNE,
    signedAt: day(12, 18),
    description: 'Site vitrine + module de prise de RDV',
  });

  // Issues sans commission : non signés / à relancer / annulés
  const julienOthers: [string, string, PrestationType, number, DealStatus][] = [
    ['Garage Morel', 'Grenoble', CONFIG, CONFIG_PRICE, DealStatus.RDV_NON_SIGNE],
    ['Taxi Fernandez', 'Nice', SITE, 1200, DealStatus.RDV_NON_SIGNE],
    ['Carrelage Lopes', 'Montpellier', CONFIG, CONFIG_PRICE, DealStatus.RDV_NON_SIGNE],
    ['Serrurerie Blanc', 'Metz', CONFIG, CONFIG_PRICE, DealStatus.A_RELANCER],
    ['Paysagiste Verdier', 'Tours', SITE, 1800, DealStatus.A_RELANCER],
    ['Plâtrerie Simon', 'Reims', CONFIG, CONFIG_PRICE, DealStatus.A_RELANCER],
    ['Nettoyage Éclat', 'Orléans', SITE, 990, DealStatus.A_RELANCER],
    ['Terrassement Vidal', 'Pau', CONFIG, CONFIG_PRICE, DealStatus.RDV_ANNULE],
    ['Auto-école Conduite+', 'Brest', SITE, 1400, DealStatus.RDV_ANNULE],
  ];
  for (const [client, city, prestation, amountHT, status] of julienOthers) {
    await mkCloserDeal({
      closer: julien,
      clientName: client,
      city,
      dealName: `${prestation === CONFIG ? 'Configurateur devis' : 'Site internet'} — ${client}`,
      prestation,
      amountHT,
      status,
    });
  }

  // ══ JULIEN — mois précédent (pour tester le sélecteur de mois) ══
  const julienPrevConfig = [
    { client: 'Isolation Confort', city: 'Caen', d: 3 },
    { client: 'Étanchéité Pro', city: 'Rouen', d: 9 },
    { client: 'Clôtures Duval', city: 'Angers', d: 15 },
    { client: 'Ramonage Express', city: 'Nancy', d: 22 },
  ];
  for (let i = 0; i < julienPrevConfig.length; i++) {
    const s = julienPrevConfig[i];
    await mkCloserDeal({
      closer: julien,
      clientName: s.client,
      city: s.city,
      dealName: `Configurateur devis — ${s.client}`,
      prestation: CONFIG,
      amountHT: CONFIG_PRICE,
      status: DealStatus.RDV_SIGNE,
      signedAt: prevDay(s.d, 10 + i),
      rank: i + 1, // paliers du mois précédent : 200/200/200/225
    });
  }
  await mkCloserDeal({
    closer: julien,
    clientName: 'Fromagerie Alpine',
    city: 'Chambéry',
    dealName: 'Site vitrine — Fromagerie Alpine',
    prestation: SITE,
    amountHT: 1800,
    status: DealStatus.RDV_SIGNE,
    signedAt: prevDay(18, 16),
  });

  // ══ SOPHIE — mois courant : 4 configurateurs (4e au palier 225) + 1 site ══
  const sophieConfig = [
    { client: 'Vitrerie Lumière', city: 'Limoges', d: 3 },
    { client: 'Charpente Bois & Co', city: 'Clermont-Ferrand', d: 8 },
    { client: 'Piscines Azur', city: 'Perpignan', d: 14 },
    { client: 'Alarmes Sécurit', city: 'Avignon', d: 20 },
  ];
  for (let i = 0; i < sophieConfig.length; i++) {
    const s = sophieConfig[i];
    await mkCloserDeal({
      closer: sophie,
      clientName: s.client,
      city: s.city,
      dealName: `Configurateur devis — ${s.client}`,
      prestation: CONFIG,
      amountHT: CONFIG_PRICE,
      status: DealStatus.RDV_SIGNE,
      signedAt: day(s.d, 9 + i),
      rank: i + 1,
    });
  }
  await mkCloserDeal({
    closer: sophie,
    clientName: 'Fleuriste Pétale',
    city: 'La Rochelle',
    dealName: 'Site vitrine — Fleuriste Pétale',
    prestation: SITE,
    amountHT: 1200,
    status: DealStatus.RDV_SIGNE,
    signedAt: day(11, 17),
  });
  await mkCloserDeal({
    closer: sophie,
    clientName: 'Pressing Net',
    city: 'Poitiers',
    dealName: 'Configurateur devis — Pressing Net',
    prestation: CONFIG,
    amountHT: CONFIG_PRICE,
    status: DealStatus.RDV_NON_SIGNE,
  });
  await mkCloserDeal({
    closer: sophie,
    clientName: 'Toiletteur Wouf',
    city: 'Bayonne',
    dealName: 'Site internet — Toiletteur Wouf',
    prestation: SITE,
    amountHT: 1100,
    status: DealStatus.A_RELANCER,
  });

  await ds.destroy();

  console.log('\n✓ Seed Closers terminé !');
  console.log('\n══ RÉSULTATS ATTENDUS (mois courant) ══');
  console.log('Julien Moreau  : 12 RDV effectués · 9 signés (7 config + 2 sites) · 3 non signés · 4 à relancer');
  console.log('                 CA HT 9 430 € · commission 1 915 € (3×200 + 3×225 + 1×250 + 150 + 240)');
  console.log('Sophie Lambert : 6 RDV effectués · 5 signés (4 config + 1 site) · 1 non signé · 1 à relancer');
  console.log('                 CA HT 4 360 € · commission 945 € (3×200 + 1×225 + 120)');
  console.log('\n══ COMPTES DE TEST (mot de passe : closer123) ══');
  console.log('Closer principal : julien.moreau@hipster-closers.fr');
  console.log('2e closer        : sophie.lambert@hipster-closers.fr');
}

seed().catch((err) => {
  console.error('Seed Closers échoué :', err);
  process.exit(1);
});
