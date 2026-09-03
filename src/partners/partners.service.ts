import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Partner, PartnerType } from './entities/partner.entity';
import { PartnerClient } from './entities/partner-client.entity';
import {
  CLOSER_STATUSES,
  Deal,
  DealStatus,
  PrestationType,
} from './entities/deal.entity';
import { Commission, CommissionStatus } from './entities/commission.entity';
import {
  DealDocument,
  DealDocumentType,
} from './entities/deal-document.entity';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { CreateCloserClientDto } from './dto/create-closer-client.dto';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { User } from 'src/users/entities/user.entity';
import { ClientType } from 'src/common/enums/client.enum';
import { OtpService } from 'src/otp/otp.service';
import { OtpType } from 'src/common/enums/otp.enum';
import { MailService } from 'src/mail/mail.service';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';
import { UpdateCommissionDto } from './dto/update-commission.dto';
import { QueryDealsDto } from './dto/query-deals.dto';
import { UsersService } from 'src/users/users.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { Role } from 'src/common/enums/role.enum';

export interface RequestUser {
  userId: number;
  roles: string[];
}

/**
 * 💶 Rémunération closers
 * - Site internet : 10 % du montant HT vendu
 * - Configurateur : paliers mensuels NON rétroactifs selon le rang de la vente
 *   (1-3 : 200 €, 4-6 : 225 €, 7+ : 250 €)
 */
export const CLOSER_SITE_RATE = 10;
export const closerConfigTierAmount = (rank: number): number =>
  rank <= 3 ? 200 : rank <= 6 ? 225 : 250;

const DEAL_RELATIONS = [
  'client',
  'apporteur',
  'apporteur.user',
  'realisateur',
  'realisateur.user',
  'commission',
  'commission.beneficiary',
  'documents',
];

@Injectable()
export class PartnersService {
  constructor(
    @InjectRepository(Partner)
    private readonly partnerRepo: Repository<Partner>,
    @InjectRepository(PartnerClient)
    private readonly clientRepo: Repository<PartnerClient>,
    @InjectRepository(Deal)
    private readonly dealRepo: Repository<Deal>,
    @InjectRepository(Commission)
    private readonly commissionRepo: Repository<Commission>,
    @InjectRepository(DealDocument)
    private readonly documentRepo: Repository<DealDocument>,
    private readonly usersService: UsersService,
    private readonly notifications: NotificationsService,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
  ) {}

  // =========================================================
  // Helpers
  // =========================================================
  private isAdmin(user: RequestUser): boolean {
    return (user.roles || []).map((r) => String(r).toLowerCase()).includes(Role.ADMIN);
  }

  /** Partenaire lié au compte connecté (ou null si non-partenaire) */
  async getMyPartner(user: RequestUser): Promise<Partner | null> {
    return this.partnerRepo.findOne({
      where: { user: { id: user.userId } },
      relations: ['user'],
    });
  }

  private async assertDealVisible(deal: Deal, user: RequestUser): Promise<void> {
    if (this.isAdmin(user)) return;
    const me = await this.getMyPartner(user);
    const ok =
      me &&
      (deal.apporteur?.id === me.id || deal.realisateur?.id === me.id);
    if (!ok) {
      throw new ForbiddenException("Vous n'avez pas accès à cette affaire");
    }
  }

  private partyLabel(partner?: Partner | null): string {
    return partner ? partner.agencyName : 'Hipster Marketing';
  }

  // =========================================================
  // PARTENAIRES (admin)
  // =========================================================
  async createPartner(dto: CreatePartnerDto): Promise<Partner> {
    const partner = this.partnerRepo.create({
      agencyName: dto.agencyName,
      type: dto.type ?? PartnerType.AGENCY,
      contactName: dto.contactName,
      email: dto.email,
      phone: dto.phone,
      speciality: dto.speciality,
      geographicZone: dto.geographicZone,
      isActive: dto.isActive ?? true,
      hasPortalAccess: false,
    });
    const saved = await this.partnerRepo.save(partner);

    if (dto.hasPortalAccess) {
      await this.provisionAccount(saved);
    }
    return this.findOnePartner(saved.id);
  }

  /** Crée le compte de login (rôle partner) et l'e-mail d'identifiants */
  private async provisionAccount(partner: Partner): Promise<Partner> {
    if (partner.user) return partner;

    const [firstName, ...rest] = (partner.contactName || partner.agencyName).split(' ');
    const user = await this.usersService.create({
      email: partner.email,
      firstName: firstName || partner.agencyName,
      lastName: rest.join(' ') || 'Partenaire',
      roles: [Role.PARTNER],
      phones: partner.phone ? [partner.phone] : undefined,
    } as any);

    partner.user = { id: user.id } as any;
    partner.hasPortalAccess = true;
    return this.partnerRepo.save(partner);
  }

  async updatePartner(id: number, dto: UpdatePartnerDto): Promise<Partner> {
    const partner = await this.findOnePartner(id);
    Object.assign(partner, {
      agencyName: dto.agencyName ?? partner.agencyName,
      type: dto.type ?? partner.type,
      contactName: dto.contactName ?? partner.contactName,
      email: dto.email ?? partner.email,
      phone: dto.phone ?? partner.phone,
      speciality: dto.speciality ?? partner.speciality,
      geographicZone: dto.geographicZone ?? partner.geographicZone,
      isActive: dto.isActive ?? partner.isActive,
    });
    await this.partnerRepo.save(partner);
    return this.findOnePartner(id);
  }

  /** Active/désactive l'accès à l'espace partenaire */
  async toggleAccess(id: number): Promise<Partner> {
    const partner = await this.findOnePartner(id);

    if (!partner.user) {
      // Premier accès : on provisionne le compte
      return this.provisionAccount(partner).then(() => this.findOnePartner(id));
    }

    partner.hasPortalAccess = !partner.hasPortalAccess;
    await this.partnerRepo.save(partner);
    // Le compte est activé/désactivé en conséquence
    await this.usersService.update(partner.user.id, {
      isActive: partner.hasPortalAccess,
    } as any);
    return this.findOnePartner(id);
  }

  async findAllPartners(): Promise<Partner[]> {
    return this.partnerRepo.find({
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOnePartner(id: number): Promise<Partner> {
    const partner = await this.partnerRepo.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!partner) throw new NotFoundException(`Partenaire #${id} introuvable`);
    return partner;
  }

  // =========================================================
  // CLIENTS
  // =========================================================
  async findAllClients(): Promise<PartnerClient[]> {
    return this.clientRepo.find({
      relations: ['apporteur'],
      order: { createdAt: 'DESC' },
    });
  }

  private async resolvePartner(id?: number | null): Promise<Partner | null> {
    if (!id) return null;
    return this.partnerRepo.findOne({ where: { id }, relations: ['user'] });
  }

  // =========================================================
  // AFFAIRES (deals)
  // =========================================================
  async createDeal(dto: CreateDealDto, user: RequestUser): Promise<Deal> {
    const me = this.isAdmin(user) ? null : await this.getMyPartner(user);

    // Apporteur / réalisateur (null = Hipster Marketing)
    let apporteur = await this.resolvePartner(dto.apporteurId ?? undefined);
    const realisateur = await this.resolvePartner(dto.realisateurId ?? undefined);

    // Un partenaire qui crée une affaire est apporteur par défaut
    if (me && !dto.apporteurId && !dto.realisateurId) {
      apporteur = me;
    }
    // Un closer est TOUJOURS l'apporteur de ses affaires
    // (ses ventes doivent remonter dans son propre tableau de bord)
    if (me?.type === PartnerType.CLOSER) {
      apporteur = me;
    }
    // Un partenaire ne peut créer que des affaires qui le concernent
    if (me && apporteur?.id !== me.id && realisateur?.id !== me.id) {
      throw new ForbiddenException(
        'Vous ne pouvez créer qu\'une affaire que vous apportez ou réalisez',
      );
    }

    // Client : existant ou nouveau
    let client: PartnerClient;
    if (dto.clientId) {
      const found = await this.clientRepo.findOne({ where: { id: dto.clientId } });
      if (!found) throw new NotFoundException('Client introuvable');
      client = found;
    } else {
      client = await this.clientRepo.save(
        this.clientRepo.create({
          name: dto.clientName || 'Client sans nom',
          email: dto.clientEmail,
          phone: dto.clientPhone,
          address: dto.clientAddress,
          apporteur: apporteur ?? undefined,
        }),
      );
    }

    const amountHT = Number(dto.amountHT) || 0;
    const isCloserDeal = apporteur?.type === PartnerType.CLOSER;
    const status = dto.status || DealStatus.NOUVELLE_AFFAIRE;

    const deal = await this.dealRepo.save(
      this.dealRepo.create({
        name: dto.name,
        prestationType: dto.prestationType,
        description: dto.description,
        amountHT,
        status,
        signedAt:
          isCloserDeal && status === DealStatus.RDV_SIGNE ? new Date() : null,
        client,
        apporteur: apporteur ?? undefined,
        realisateur: realisateur ?? undefined,
        createdBy: { id: user.userId } as any,
      }),
    );

    // Commission automatique (10 % agences ; paliers/10 % closers recalculés ensuite)
    const rate = 10;
    await this.commissionRepo.save(
      this.commissionRepo.create({
        deal: { id: deal.id } as any,
        rate,
        amount: isCloserDeal ? 0 : this.round2((amountHT * rate) / 100),
        beneficiary: apporteur ?? undefined,
        status: CommissionStatus.A_CALCULER,
      }),
    );
    if (isCloserDeal) {
      await this.recomputeCloserCommission(deal.id);
    }

    await this.notifyDealAssigned(deal, apporteur, realisateur, user);
    return this.findOneDeal(deal.id, user);
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  async findDeals(query: QueryDealsDto, user: RequestUser): Promise<Deal[]> {
    const qb = this.dealRepo
      .createQueryBuilder('deal')
      .leftJoinAndSelect('deal.client', 'client')
      .leftJoinAndSelect('deal.apporteur', 'apporteur')
      .leftJoinAndSelect('deal.realisateur', 'realisateur')
      .leftJoinAndSelect('deal.commission', 'commission')
      .leftJoinAndSelect('commission.beneficiary', 'beneficiary')
      .orderBy('deal.createdAt', 'DESC');

    if (query.status) {
      qb.andWhere('deal.status = :status', { status: query.status });
    }

    if (!this.isAdmin(user)) {
      const me = await this.getMyPartner(user);
      if (!me) return [];
      qb.andWhere(
        '(apporteur.id = :meId OR realisateur.id = :meId)',
        { meId: me.id },
      );
    }

    return qb.getMany();
  }

  async findOneDeal(id: number, user: RequestUser): Promise<Deal> {
    const deal = await this.dealRepo.findOne({
      where: { id },
      relations: DEAL_RELATIONS,
    });
    if (!deal) throw new NotFoundException(`Affaire #${id} introuvable`);
    await this.assertDealVisible(deal, user);
    return deal;
  }

  async updateDeal(id: number, dto: UpdateDealDto, user: RequestUser): Promise<Deal> {
    const deal = await this.findOneDeal(id, user);

    if (dto.name !== undefined) deal.name = dto.name;
    if (dto.prestationType !== undefined) deal.prestationType = dto.prestationType;
    if (dto.description !== undefined) deal.description = dto.description;
    if (dto.realisateurId !== undefined) {
      deal.realisateur = (await this.resolvePartner(dto.realisateurId)) ?? undefined;
    }
    if (dto.apporteurId !== undefined) {
      deal.apporteur = (await this.resolvePartner(dto.apporteurId)) ?? undefined;
    }

    let recompute = false;
    if (dto.amountHT !== undefined) {
      deal.amountHT = Number(dto.amountHT) || 0;
      recompute = true;
    }
    await this.dealRepo.save(deal);

    // prestationType change les règles closers (10 % site vs paliers configurateur)
    if (recompute || dto.apporteurId !== undefined || dto.prestationType !== undefined) {
      await this.recomputeCommission(deal.id);
    }
    return this.findOneDeal(id, user);
  }

  private async recomputeCommission(dealId: number): Promise<void> {
    const deal = await this.dealRepo.findOne({
      where: { id: dealId },
      relations: ['apporteur', 'commission'],
    });
    if (!deal) return;

    // Affaire apportée par un closer → règles closers (10 % site / paliers configurateur)
    if (deal.apporteur?.type === PartnerType.CLOSER) {
      return this.recomputeCloserCommission(dealId);
    }

    let commission = deal.commission;
    if (!commission) {
      commission = this.commissionRepo.create({
        deal: { id: dealId } as any,
        rate: 10,
        status: CommissionStatus.A_CALCULER,
      });
    }
    commission.amount = this.round2((Number(deal.amountHT) * Number(commission.rate)) / 100);
    commission.beneficiary = deal.apporteur ?? undefined;
    await this.commissionRepo.save(commission);
  }

  /**
   * 💶 Commission closer — ne compte que lorsque l'affaire est SIGNÉE.
   * Site internet : 10 % du HT. Configurateur : palier selon le rang de la
   * vente signée dans le mois (paliers non rétroactifs, remise à zéro le 1er).
   */
  private async recomputeCloserCommission(dealId: number): Promise<void> {
    const deal = await this.dealRepo.findOne({
      where: { id: dealId },
      relations: ['apporteur', 'commission'],
    });
    if (!deal || !deal.apporteur) return;

    let commission = deal.commission;
    if (!commission) {
      commission = this.commissionRepo.create({
        deal: { id: dealId } as any,
        rate: 0,
        status: CommissionStatus.A_CALCULER,
      });
    }
    commission.beneficiary = deal.apporteur;

    if (deal.status !== DealStatus.RDV_SIGNE) {
      // Non signé / à relancer / annulé → aucune commission
      commission.amount = 0;
      commission.saleRank = null;
      commission.status = CommissionStatus.A_CALCULER;
      commission.dueDate = null;
      await this.commissionRepo.save(commission);
      return;
    }

    const signedAt = deal.signedAt ? new Date(deal.signedAt) : new Date();
    if (deal.prestationType === PrestationType.CONFIGURATEUR) {
      // Rang de la vente dans le mois de signature (les ventes de sites ne comptent pas)
      const monthStart = new Date(signedAt.getFullYear(), signedAt.getMonth(), 1);
      const monthEnd = new Date(signedAt.getFullYear(), signedAt.getMonth() + 1, 1);
      const before = await this.dealRepo
        .createQueryBuilder('d')
        .innerJoin('d.apporteur', 'a')
        .where('a.id = :closerId', { closerId: deal.apporteur.id })
        .andWhere('d.id != :dealId', { dealId: deal.id })
        .andWhere('d.status = :signed', { signed: DealStatus.RDV_SIGNE })
        .andWhere('d.prestationType = :config', {
          config: PrestationType.CONFIGURATEUR,
        })
        .andWhere('d.signedAt >= :monthStart AND d.signedAt < :monthEnd', {
          monthStart,
          monthEnd,
        })
        .andWhere(
          '(d.signedAt < :signedAt OR (d.signedAt = :signedAt AND d.id < :dealId))',
          { signedAt },
        )
        .getCount();
      const rank = before + 1;
      commission.saleRank = rank;
      commission.rate = 0;
      commission.amount = closerConfigTierAmount(rank);
    } else {
      // Site internet (et défaut) : 10 % du montant HT vendu
      commission.saleRank = null;
      commission.rate = CLOSER_SITE_RATE;
      commission.amount = this.round2(
        (Number(deal.amountHT) * CLOSER_SITE_RATE) / 100,
      );
    }

    // Signé → la commission est due au closer par Hipster Marketing
    commission.status = CommissionStatus.A_PAYER;
    commission.dueDate = commission.dueDate || new Date();
    await this.commissionRepo.save(commission);
  }

  async updateStatus(id: number, status: DealStatus, user: RequestUser): Promise<Deal> {
    const deal = await this.findOneDeal(id, user);
    const previous = deal.status;
    deal.status = status;

    const isCloserDeal = deal.apporteur?.type === PartnerType.CLOSER;
    if (isCloserDeal) {
      if (status === DealStatus.RDV_SIGNE && previous !== DealStatus.RDV_SIGNE) {
        deal.signedAt = new Date();
      } else if (
        status !== DealStatus.RDV_SIGNE &&
        previous === DealStatus.RDV_SIGNE
      ) {
        deal.signedAt = null;
      }
    }
    await this.dealRepo.save(deal);

    // Effets métier sur la commission
    if (isCloserDeal) {
      await this.recomputeCloserCommission(deal.id);
      if (status === DealStatus.RDV_SIGNE && previous !== DealStatus.RDV_SIGNE) {
        await this.notifyCommissionDue(deal);
      }
    } else if (status === DealStatus.ACOMPTE_ENCAISSE && deal.commission) {
      deal.commission.status = CommissionStatus.A_FACTURER;
      deal.commission.dueDate = new Date();
      await this.commissionRepo.save(deal.commission);
      await this.notifyCommissionDue(deal);
    }

    await this.notifyStatusChange(deal, previous, status);
    return this.findOneDeal(id, user);
  }

  // =========================================================
  // COMMISSIONS
  // =========================================================
  async findCommissions(user: RequestUser): Promise<Commission[]> {
    const qb = this.commissionRepo
      .createQueryBuilder('commission')
      .leftJoinAndSelect('commission.deal', 'deal')
      .leftJoinAndSelect('deal.client', 'client')
      .leftJoinAndSelect('deal.apporteur', 'apporteur')
      .leftJoinAndSelect('deal.realisateur', 'realisateur')
      .leftJoinAndSelect('commission.beneficiary', 'beneficiary')
      .orderBy('commission.createdAt', 'DESC');

    if (!this.isAdmin(user)) {
      const me = await this.getMyPartner(user);
      if (!me) return [];
      qb.andWhere('(apporteur.id = :meId OR realisateur.id = :meId)', {
        meId: me.id,
      });
    }
    return qb.getMany();
  }

  async updateCommission(
    id: number,
    dto: UpdateCommissionDto,
    user: RequestUser,
  ): Promise<Commission> {
    if (!this.isAdmin(user)) {
      throw new ForbiddenException('Seul Hipster Marketing gère les commissions');
    }
    const commission = await this.commissionRepo.findOne({
      where: { id },
      relations: ['deal', 'deal.apporteur', 'deal.apporteur.user', 'beneficiary'],
    });
    if (!commission) throw new NotFoundException('Commission introuvable');

    if (dto.status !== undefined) commission.status = dto.status;
    if (dto.dueDate !== undefined) commission.dueDate = new Date(dto.dueDate);
    if (dto.invoiceReference !== undefined)
      commission.invoiceReference = dto.invoiceReference;
    if (dto.paymentDate !== undefined)
      commission.paymentDate = new Date(dto.paymentDate);

    // Passage à "payée" → date de paiement + notification
    if (dto.status === CommissionStatus.PAYEE) {
      commission.paymentDate = commission.paymentDate || new Date();
    }
    const saved = await this.commissionRepo.save(commission);

    if (dto.status === CommissionStatus.PAYEE) {
      await this.notifyCommissionPaid(commission);
    }
    return saved;
  }

  async attachJustificatif(id: number, path: string): Promise<Commission> {
    const commission = await this.commissionRepo.findOne({ where: { id } });
    if (!commission) throw new NotFoundException('Commission introuvable');
    commission.justificatifPath = path;
    return this.commissionRepo.save(commission);
  }

  // =========================================================
  // DOCUMENTS
  // =========================================================
  async addDocument(
    dealId: number,
    file: {
      originalName: string;
      filename: string;
      url: string;
      mimeType?: string;
      size?: number;
    },
    type: DealDocumentType,
    user: RequestUser,
  ): Promise<DealDocument> {
    const deal = await this.findOneDeal(dealId, user);
    const doc = await this.documentRepo.save(
      this.documentRepo.create({
        deal: { id: deal.id } as any,
        type: type || DealDocumentType.DOCUMENT_UTILE,
        originalName: file.originalName,
        filename: file.filename,
        url: file.url,
        mimeType: file.mimeType,
        size: file.size,
        uploadedBy: { id: user.userId } as any,
      }),
    );
    await this.notifyNewDocument(deal, user);
    return doc;
  }

  async listDocuments(dealId: number, user: RequestUser): Promise<DealDocument[]> {
    await this.findOneDeal(dealId, user); // contrôle d'accès
    return this.documentRepo.find({
      where: { deal: { id: dealId } },
      relations: ['uploadedBy'],
      order: { uploadedAt: 'DESC' },
    });
  }

  async removeDocument(docId: number, user: RequestUser): Promise<{ message: string }> {
    const doc = await this.documentRepo.findOne({
      where: { id: docId },
      relations: ['deal'],
    });
    if (!doc) throw new NotFoundException('Document introuvable');
    await this.findOneDeal(doc.deal.id, user); // contrôle d'accès
    await this.documentRepo.remove(doc);
    return { message: 'Document supprimé' };
  }

  // =========================================================
  // DASHBOARDS
  // =========================================================
  async getAdminDashboard() {
    const deals = await this.dealRepo.find({
      relations: ['apporteur', 'realisateur', 'commission', 'client'],
      order: { createdAt: 'DESC' },
    });
    const partners = await this.partnerRepo.find({ where: { isActive: true } });

    const commissions = deals
      .map((d) => d.commission)
      .filter((c): c is Commission => Boolean(c));

    const toReceive = commissions
      .filter((c) => c.status !== CommissionStatus.PAYEE)
      .reduce((s, c) => s + Number(c.amount), 0);
    const paid = commissions
      .filter((c) => c.status === CommissionStatus.PAYEE)
      .reduce((s, c) => s + Number(c.amount), 0);

    return {
      newDeals: deals.filter((d) => d.status === DealStatus.NOUVELLE_AFFAIRE).length,
      inProgress: deals.filter((d) => d.status === DealStatus.PROJET_EN_COURS).length,
      acceptedQuotes: deals.filter((d) => d.status === DealStatus.DEVIS_ACCEPTE).length,
      commissionsToReceive: this.round2(toReceive),
      commissionsPaid: this.round2(paid),
      activePartners: partners.length,
      recentDeals: deals.slice(0, 6),
      partners: partners.slice(0, 6),
    };
  }

  async getPartnerDashboard(user: RequestUser) {
    const me = await this.getMyPartner(user);
    if (!me) throw new NotFoundException('Profil partenaire introuvable');

    const deals = await this.dealRepo.find({
      where: [{ apporteur: { id: me.id } }, { realisateur: { id: me.id } }],
      relations: ['apporteur', 'realisateur', 'commission', 'client'],
      order: { createdAt: 'DESC' },
    });

    let toReceive = 0;
    let received = 0;
    let toPay = 0;
    let payedByMe = 0;

    for (const d of deals) {
      const c = d.commission;
      if (!c) continue;
      const amount = Number(c.amount);
      const iAmApporteur = d.apporteur?.id === me.id;
      const iAmRealisateur = d.realisateur?.id === me.id;
      const isPaid = c.status === CommissionStatus.PAYEE;

      if (iAmApporteur) {
        if (isPaid) received += amount;
        else toReceive += amount;
      } else if (iAmRealisateur) {
        // je dois verser la commission à l'apporteur
        if (isPaid) payedByMe += amount;
        else toPay += amount;
      }
    }

    return {
      newDeals: deals.filter((d) => d.status === DealStatus.NOUVELLE_AFFAIRE).length,
      inProgress: deals.filter((d) => d.status === DealStatus.PROJET_EN_COURS).length,
      acceptedQuotes: deals.filter((d) => d.status === DealStatus.DEVIS_ACCEPTE).length,
      commissionsToReceive: this.round2(toReceive),
      commissionsReceived: this.round2(received),
      commissionsToPay: this.round2(toPay),
      commissionsPaid: this.round2(payedByMe),
      recentDeals: deals.slice(0, 6),
    };
  }

  // =========================================================
  // CLOSERS — clients signés
  // =========================================================

  /**
   * 👤 Un closer crée la fiche client d'un artisan qu'il vient de signer :
   * - compte espace client créé (email avec lien pour définir son mot de passe)
   * - client rattaché définitivement au closer d'origine
   * - fiche visible côté admin + notification admin
   */
  async createCloserClient(dto: CreateCloserClientDto, user: RequestUser) {
    const me = await this.getMyPartner(user);
    if (!me || me.type !== PartnerType.CLOSER) {
      throw new ForbiddenException('Réservé aux closers');
    }

    const userRepo = this.partnerRepo.manager.getRepository(User);
    const profileRepo = this.partnerRepo.manager.getRepository(ClientProfile);

    const email = dto.email.trim().toLowerCase();
    const existing = await userRepo.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('Cet email est déjà utilisé par un compte');
    }

    // Mot de passe aléatoire jamais communiqué : le client définit le sien
    // via le lien envoyé par email.
    const randomPassword = await bcrypt.hash(
      crypto.randomBytes(24).toString('hex'),
      10,
    );

    const clientUser = await userRepo.save(
      userRepo.create({
        email,
        password: randomPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phones: dto.phone ? [dto.phone] : undefined,
        roles: [Role.CLIENT_MARKETING],
        isActive: true,
        isEmailVerified: true,
        clientProfile: {
          companyName: dto.companyName,
          clientType: ClientType.COMPANY,
          siren: dto.siren,
          siret: dto.siret,
          contactEmail: email,
          billingAddress: dto.address,
        } as ClientProfile,
      }),
    );

    const profile = await profileRepo.findOne({
      where: { user: { id: clientUser.id } },
    });
    if (!profile) throw new NotFoundException('Profil client non créé');
    profile.originCloser = me;
    profile.originCloserId = me.id;
    await profileRepo.save(profile);

    // Client miroir dans le CRM Partners pour les affaires, lié à la fiche CRM
    const partnerClient = await this.clientRepo.save(
      this.clientRepo.create({
        name: dto.companyName,
        email,
        phone: dto.phone,
        address: dto.address,
        apporteur: me,
        clientProfileId: profile.id,
      }),
    );

    // Email d'accès : lien de définition du mot de passe, valable 72 h
    try {
      const code = await this.otpService.generateOtp(
        clientUser,
        OtpType.PASSWORD_RESET,
        72 * 60,
      );
      const base = process.env.FRONTEND_URL || 'https://hipster-ia.fr';
      const setPasswordUrl = `${base}/set-password?email=${encodeURIComponent(email)}&code=${code}`;
      await this.mailService.sendEmail({
        to: email,
        subject: 'Bienvenue — activez votre espace client Hipster Marketing',
        template: 'client-set-password',
        context: {
          name: `${dto.firstName} ${dto.lastName}`,
          email,
          setPasswordUrl,
          closerName: me.contactName || me.agencyName,
        },
        userRoles: clientUser.roles,
      });
    } catch (e) {
      this.logger.error(`Échec envoi email d'accès client: ${e}`);
    }

    // Notification des admins : « Nouveau client créé par X : Y »
    try {
      const admins = await userRepo
        .createQueryBuilder('u')
        .where('u.roles LIKE :role', { role: '%admin%' })
        .getMany();
      await Promise.all(
        admins.map((admin) =>
          this.notifications.notifyUser({
            userId: admin.id,
            type: 'closer_client_created',
            title: '👤 Nouveau client signé',
            message: `Nouveau client créé par ${me.agencyName} : ${dto.companyName}`,
            actionUrl: `/app/client/show?id=${profile.id}`,
            data: { clientProfileId: profile.id, closerId: me.id },
          }),
        ),
      );
    } catch (e) {
      this.logger.error(`Échec notification admin nouveau client: ${e}`);
    }

    return {
      clientProfileId: profile.id,
      partnerClientId: partnerClient.id,
      email,
      message: "Client créé — l'email d'accès a été envoyé",
    };
  }

  /** 📋 Clients signés par le closer connecté (chacun ne voit que les siens) */
  async getMyClients(user: RequestUser) {
    const me = await this.getMyPartner(user);
    if (!me) throw new NotFoundException('Profil partenaire introuvable');

    const profileRepo = this.partnerRepo.manager.getRepository(ClientProfile);
    const profiles = await profileRepo.find({
      where: { originCloserId: me.id },
      relations: ['user'],
      order: { id: 'DESC' },
    });

    // Correspondance vers le client CRM Partners (pour créer des affaires)
    const partnerClients = await this.clientRepo.find({
      where: { apporteur: { id: me.id } },
    });
    const byProfile = new Map(
      partnerClients
        .filter((pc) => pc.clientProfileId)
        .map((pc) => [pc.clientProfileId as number, pc.id]),
    );

    return profiles.map((p) => ({
      id: p.id,
      companyName: p.companyName,
      firstName: p.user?.firstName,
      lastName: p.user?.lastName,
      email: p.user?.email,
      phones: p.user?.phones ?? [],
      siren: p.siren ?? null,
      siret: p.siret ?? null,
      address: p.billingAddress ?? null,
      createdAt: p.user?.createdAt ?? null,
      partnerClientId: byProfile.get(p.id) ?? null,
    }));
  }

  // =========================================================
  // CLOSERS — statistiques mensuelles
  // =========================================================

  /** Bornes du mois demandé (format 'YYYY-MM', défaut : mois courant) */
  private monthRange(month?: string): { start: Date; end: Date } {
    let base = new Date();
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split('-').map(Number);
      base = new Date(y, m - 1, 1);
    }
    return {
      start: new Date(base.getFullYear(), base.getMonth(), 1),
      end: new Date(base.getFullYear(), base.getMonth() + 1, 1),
    };
  }

  /**
   * 📊 Résultats du mois d'un closer.
   * Signé → compté sur le mois de signature (signedAt).
   * Autres issues → comptées sur le mois de dernière mise à jour.
   */
  async getCloserMonthlyStats(closer: Partner, month?: string) {
    const { start, end } = this.monthRange(month);
    const deals = await this.dealRepo.find({
      where: { apporteur: { id: closer.id } },
      relations: ['commission', 'client'],
      order: { createdAt: 'DESC' },
    });

    const inMonth = (d?: Date | string | null) => {
      if (!d) return false;
      const date = new Date(d);
      return date >= start && date < end;
    };

    const signes = deals.filter(
      (d) => d.status === DealStatus.RDV_SIGNE && inMonth(d.signedAt || d.updatedAt),
    );
    const nonSignes = deals.filter(
      (d) => d.status === DealStatus.RDV_NON_SIGNE && inMonth(d.updatedAt),
    );
    const aRelancer = deals.filter(
      (d) => d.status === DealStatus.A_RELANCER && inMonth(d.updatedAt),
    );
    const annules = deals.filter(
      (d) => d.status === DealStatus.RDV_ANNULE && inMonth(d.updatedAt),
    );

    const ventesConfigurateur = signes.filter(
      (d) => d.prestationType === PrestationType.CONFIGURATEUR,
    ).length;
    const caHT = signes.reduce((s, d) => s + Number(d.amountHT), 0);
    const commissionMois = signes.reduce(
      (s, d) => s + Number(d.commission?.amount || 0),
      0,
    );

    return {
      closerId: closer.id,
      closerName: closer.agencyName,
      contactName: closer.contactName || null,
      // Rendez-vous effectués = issues renseignées signé + non signé
      rdvEffectues: signes.length + nonSignes.length,
      signes: signes.length,
      nonSignes: nonSignes.length,
      aRelancer: aRelancer.length,
      annules: annules.length,
      ventesConfigurateur,
      // Palier applicable à la PROCHAINE vente configurateur du mois
      palierActuel: closerConfigTierAmount(ventesConfigurateur + 1),
      caHT: this.round2(caHT),
      commissionMois: this.round2(commissionMois),
    };
  }

  /** 📊 Résultats du closer connecté */
  async getMyCloserStats(user: RequestUser, month?: string) {
    const me = await this.getMyPartner(user);
    if (!me) throw new NotFoundException('Profil partenaire introuvable');
    return this.getCloserMonthlyStats(me, month);
  }

  /** 📊 Vue admin : résultats de chaque closer + total équipe */
  async getClosersStats(month?: string) {
    const closers = await this.partnerRepo.find({
      where: { type: PartnerType.CLOSER },
      order: { agencyName: 'ASC' },
    });
    const closerStats = await Promise.all(
      closers.map((c) => this.getCloserMonthlyStats(c, month)),
    );
    const total = closerStats.reduce(
      (acc, s) => ({
        rdvEffectues: acc.rdvEffectues + s.rdvEffectues,
        signes: acc.signes + s.signes,
        nonSignes: acc.nonSignes + s.nonSignes,
        aRelancer: acc.aRelancer + s.aRelancer,
        annules: acc.annules + s.annules,
        ventesConfigurateur: acc.ventesConfigurateur + s.ventesConfigurateur,
        caHT: this.round2(acc.caHT + s.caHT),
        commissionMois: this.round2(acc.commissionMois + s.commissionMois),
      }),
      {
        rdvEffectues: 0,
        signes: 0,
        nonSignes: 0,
        aRelancer: 0,
        annules: 0,
        ventesConfigurateur: 0,
        caHT: 0,
        commissionMois: 0,
      },
    );
    return { closers: closerStats, total };
  }

  // =========================================================
  // NOTIFICATIONS
  // =========================================================
  private async notify(partner: Partner | null | undefined, params: {
    title: string;
    message: string;
    type: string;
    actionUrl?: string;
    data?: any;
  }) {
    if (!partner?.user?.id) return;
    try {
      await this.notifications.notifyUser({ userId: partner.user.id, ...params });
    } catch {
      /* ne bloque pas le flux métier */
    }
  }

  private async notifyDealAssigned(
    deal: Deal,
    apporteur: Partner | null,
    realisateur: Partner | null,
    creator: RequestUser,
  ) {
    const actionUrl = `/partner/deals/${deal.id}`;
    // Réalisateur partenaire → nouvelle affaire attribuée
    if (realisateur && realisateur.user?.id !== creator.userId) {
      await this.notify(realisateur, {
        type: 'partner_deal_assigned',
        title: '💼 Nouvelle affaire attribuée',
        message: `L'affaire « ${deal.name} » vous a été attribuée en réalisation.`,
        actionUrl,
        data: { dealId: deal.id },
      });
    }
    // Apporteur partenaire (si ce n'est pas le créateur)
    if (apporteur && apporteur.user?.id !== creator.userId) {
      await this.notify(apporteur, {
        type: 'partner_deal_new',
        title: '🤝 Nouvelle affaire',
        message: `Une affaire « ${deal.name} » que vous apportez a été enregistrée.`,
        actionUrl,
        data: { dealId: deal.id },
      });
    }
  }

  private async notifyStatusChange(deal: Deal, previous: DealStatus, status: DealStatus) {
    if (previous === status) return;
    const actionUrl = `/partner/deals/${deal.id}`;
    const label = STATUS_LABELS[status] || status;

    let title = '🔄 Statut mis à jour';
    if (status === DealStatus.DEVIS_ACCEPTE) title = '✅ Devis accepté';
    if (status === DealStatus.ACOMPTE_ENCAISSE) title = '💰 Acompte encaissé';

    const payload = {
      type: 'partner_deal_status',
      title,
      message: `Affaire « ${deal.name} » : ${label}.`,
      actionUrl,
      data: { dealId: deal.id, status },
    };
    await this.notify(deal.apporteur, payload);
    if (deal.realisateur?.id !== deal.apporteur?.id) {
      await this.notify(deal.realisateur, payload);
    }
  }

  private async notifyCommissionDue(deal: Deal) {
    await this.notify(deal.apporteur, {
      type: 'partner_commission_due',
      title: '💶 Commission due',
      message: `Votre commission sur « ${deal.name} » est devenue due.`,
      actionUrl: `/partner/commissions`,
      data: { dealId: deal.id },
    });
  }

  private async notifyCommissionPaid(commission: Commission) {
    const beneficiary = commission.beneficiary;
    await this.notify(beneficiary, {
      type: 'partner_commission_paid',
      title: '✅ Commission payée',
      message: `Votre commission de ${Number(commission.amount)} € a été déclarée payée.`,
      actionUrl: `/partner/commissions`,
      data: { commissionId: commission.id },
    });
  }

  private async notifyNewDocument(deal: Deal, uploader: RequestUser) {
    const payload = {
      type: 'partner_deal_document',
      title: '📎 Nouveau document',
      message: `Un document a été ajouté à l'affaire « ${deal.name} ».`,
      actionUrl: `/partner/deals/${deal.id}`,
      data: { dealId: deal.id },
    };
    if (deal.apporteur?.user?.id !== uploader.userId) {
      await this.notify(deal.apporteur, payload);
    }
    if (
      deal.realisateur?.id !== deal.apporteur?.id &&
      deal.realisateur?.user?.id !== uploader.userId
    ) {
      await this.notify(deal.realisateur, payload);
    }
  }

  private readonly logger = new Logger(PartnersService.name);

  // =========================================================
  // Partner CRUD — Delete
  // =========================================================

  async removePartner(id: number): Promise<{ message: string }> {
    const partner = await this.partnerRepo.findOneBy({ id });
    if (!partner) throw new NotFoundException('Partenaire introuvable');
    await this.partnerRepo.remove(partner);
    return { message: `Partenaire #${id} supprimé avec succès` };
  }

  async removeManyPartners(
    ids: number[],
  ): Promise<{ deleted: number; notFound: number[] }> {
    const partners = await this.partnerRepo.find({
      where: { id: In(ids) },
    });
    const foundIds = partners.map((p) => p.id);
    const notFound = ids.filter((id) => !foundIds.includes(id));
    if (partners.length) await this.partnerRepo.remove(partners);
    return { deleted: partners.length, notFound };
  }

  // =========================================================
  // Deal CRUD — Delete
  // =========================================================

  async removeDeal(id: number): Promise<{ message: string }> {
    const deal = await this.dealRepo.findOneBy({ id });
    if (!deal) throw new NotFoundException('Affaire introuvable');
    await this.dealRepo.remove(deal);
    return { message: `Affaire #${id} supprimée avec succès` };
  }

  async removeManyDeals(
    ids: number[],
  ): Promise<{ deleted: number; notFound: number[] }> {
    const deals = await this.dealRepo.find({
      where: { id: In(ids) },
    });
    const foundIds = deals.map((d) => d.id);
    const notFound = ids.filter((id) => !foundIds.includes(id));
    if (deals.length) await this.dealRepo.remove(deals);
    return { deleted: deals.length, notFound };
  }
}

export const STATUS_LABELS: Record<string, string> = {
  nouvelle_affaire: 'Nouvelle affaire',
  client_contacte: 'Client contacté',
  devis_en_preparation: 'Devis en préparation',
  devis_envoye: 'Devis envoyé',
  devis_accepte: 'Devis accepté',
  acompte_encaisse: 'Acompte encaissé',
  projet_en_cours: 'Projet en cours',
  projet_termine: 'Projet terminé',
  projet_annule: 'Projet annulé',
  rdv_signe: 'Rendez-vous effectué – SIGNÉ',
  rdv_non_signe: 'Rendez-vous effectué – NON SIGNÉ',
  a_relancer: 'À relancer',
  rdv_annule: 'Rendez-vous annulé / absent',
};
