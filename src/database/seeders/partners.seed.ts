import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from 'src/data-source';
import { User } from 'src/users/entities/user.entity';
import { Role } from 'src/common/enums/role.enum';
import { Partner } from 'src/partners/entities/partner.entity';
import { PartnerClient } from 'src/partners/entities/partner-client.entity';
import { Deal, DealStatus } from 'src/partners/entities/deal.entity';
import { Commission, CommissionStatus } from 'src/partners/entities/commission.entity';

/**
 * 🌱 Seed du module Hipster Partners.
 * Comptes partenaires avec mot de passe CONNU pour tester le login : « password123 ».
 * Idempotent : si le partenaire "Com'Plus" existe déjà, on n'insère rien.
 *
 *   npm run seed:partners
 */
async function seed() {
  const ds = await AppDataSource.initialize();
  console.log('✓ Database connected');

  const userRepo = ds.getRepository(User);
  const partnerRepo = ds.getRepository(Partner);
  const clientRepo = ds.getRepository(PartnerClient);
  const dealRepo = ds.getRepository(Deal);
  const commissionRepo = ds.getRepository(Commission);

  const SENTINEL_EMAIL = 'complus@hipster-partners.com';
  const existing = await partnerRepo.findOne({ where: { email: SENTINEL_EMAIL } });
  if (existing) {
    console.log('⚠ Données de démo Partners déjà présentes — rien à faire.');
    await ds.destroy();
    return;
  }

  const password = await bcrypt.hash('password123', 10);

  // ── Helper : crée le compte de login + la fiche partenaire ──
  async function createPartner(opts: {
    agencyName: string;
    contactName: string;
    email: string;
    firstName: string;
    lastName: string;
    speciality: string;
    geographicZone: string;
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
        agencyName: opts.agencyName,
        contactName: opts.contactName,
        email: opts.email,
        phone: '01 23 45 67 89',
        speciality: opts.speciality,
        geographicZone: opts.geographicZone,
        isActive: true,
        hasPortalAccess: true,
        user: { id: user.id } as User,
      }),
    );
  }

  // ── 1. Partenaires ──
  const complus = await createPartner({
    agencyName: "Com'Plus",
    contactName: 'Camille Prévost',
    email: SENTINEL_EMAIL,
    firstName: 'Camille',
    lastName: 'Prévost',
    speciality: 'Réseaux sociaux',
    geographicZone: 'Lyon',
  });
  const weblocal = await createPartner({
    agencyName: 'WebLocal',
    contactName: 'Walid Benali',
    email: 'weblocal@hipster-partners.com',
    firstName: 'Walid',
    lastName: 'Benali',
    speciality: 'Sites internet',
    geographicZone: 'Paris',
  });
  const shootpro = await createPartner({
    agencyName: 'ShootPro',
    contactName: 'Sarah Photo',
    email: 'shootpro@hipster-partners.com',
    firstName: 'Sarah',
    lastName: 'Photo',
    speciality: 'Photo / Vidéo',
    geographicZone: 'Marseille',
  });
  console.log('✓ 3 partenaires créés (login : password123)');

  // ── 2. Clients ──
  const mkClient = (name: string, apporteur: Partner | null) =>
    clientRepo.save(
      clientRepo.create({
        name,
        email: `contact@${name.toLowerCase().replace(/[^a-z]/g, '')}.fr`,
        phone: '04 00 00 00 00',
        apporteur: apporteur ?? undefined,
      }),
    );

  const dupont = await mkClient('Société Dupont', complus);
  const martin = await mkClient('Boulangerie Martin', weblocal);
  const autoplus = await mkClient('Garage AutoPlus', null);
  const terrasse = await mkClient('Restaurant La Terrasse', null);
  const camping = await mkClient('Camping du Lac', shootpro);

  // ── 3. Affaires + commissions ──
  async function mkDeal(opts: {
    name: string;
    client: PartnerClient;
    prestationType: string;
    amountHT: number;
    status: DealStatus;
    apporteur: Partner | null;
    realisateur: Partner | null;
    commissionStatus: CommissionStatus;
    paid?: boolean;
    invoiceReference?: string;
  }) {
    const deal = await dealRepo.save(
      dealRepo.create({
        name: opts.name,
        client: opts.client,
        prestationType: opts.prestationType,
        amountHT: opts.amountHT,
        status: opts.status,
        apporteur: opts.apporteur ?? undefined,
        realisateur: opts.realisateur ?? undefined,
      }),
    );
    await commissionRepo.save(
      commissionRepo.create({
        deal: { id: deal.id } as Deal,
        rate: 10,
        amount: Math.round(opts.amountHT * 10) / 100,
        beneficiary: opts.apporteur ?? undefined,
        status: opts.commissionStatus,
        dueDate: opts.commissionStatus !== CommissionStatus.A_CALCULER ? new Date() : null,
        paymentDate: opts.paid ? new Date() : null,
        invoiceReference: opts.invoiceReference,
      }),
    );
    return deal;
  }

  await mkDeal({
    name: 'Développement application',
    client: dupont,
    prestationType: 'Application',
    amountHT: 12000,
    status: DealStatus.PROJET_EN_COURS,
    apporteur: complus,
    realisateur: null, // Hipster Marketing réalise
    commissionStatus: CommissionStatus.A_PAYER,
  });
  await mkDeal({
    name: 'Refonte site + e-commerce',
    client: martin,
    prestationType: 'Site internet',
    amountHT: 4500,
    status: DealStatus.DEVIS_ACCEPTE,
    apporteur: weblocal,
    realisateur: null,
    commissionStatus: CommissionStatus.A_FACTURER,
  });
  await mkDeal({
    name: 'Site internet',
    client: autoplus,
    prestationType: 'Site vitrine',
    amountHT: 2300,
    status: DealStatus.PROJET_EN_COURS,
    apporteur: null, // Hipster Marketing apporte
    realisateur: weblocal, // WebLocal réalise (et doit verser la commission à HM)
    commissionStatus: CommissionStatus.A_CALCULER,
  });
  await mkDeal({
    name: 'Réseaux sociaux',
    client: terrasse,
    prestationType: 'Community management',
    amountHT: 1200,
    status: DealStatus.DEVIS_ACCEPTE,
    apporteur: null, // Hipster Marketing apporte
    realisateur: complus, // Com'Plus réalise (doit verser à HM)
    commissionStatus: CommissionStatus.A_CALCULER,
  });
  await mkDeal({
    name: 'Photographie produit',
    client: camping,
    prestationType: 'Photo / Vidéo',
    amountHT: 800,
    status: DealStatus.NOUVELLE_AFFAIRE,
    apporteur: shootpro,
    realisateur: null,
    commissionStatus: CommissionStatus.A_CALCULER,
  });
  // Une commission déjà payée pour Com'Plus (→ "commissions reçues")
  await mkDeal({
    name: 'Refonte site vitrine',
    client: dupont,
    prestationType: 'Site internet',
    amountHT: 1500,
    status: DealStatus.PROJET_TERMINE,
    apporteur: complus,
    realisateur: null,
    commissionStatus: CommissionStatus.PAYEE,
    paid: true,
    invoiceReference: 'FA-COM-2026-001',
  });

  console.log('✓ 5 clients + 6 affaires + commissions créés');

  await ds.destroy();
  console.log('\n✓ Seed Partners terminé !');
  console.log('\n── Comptes partenaires (mot de passe : password123) ──');
  console.log("Com'Plus  : complus@hipster-partners.com");
  console.log('WebLocal  : weblocal@hipster-partners.com');
  console.log('ShootPro  : shootpro@hipster-partners.com');
}

seed().catch((err) => {
  console.error('Seed Partners échoué :', err);
  process.exit(1);
});
