import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Partner } from './entities/partner.entity';
import { PartnerClient } from './entities/partner-client.entity';
import { Deal, DealStatus } from './entities/deal.entity';
import { Commission, CommissionStatus } from './entities/commission.entity';
import {
  DealDocument,
  DealDocumentType,
} from './entities/deal-document.entity';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
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
    const deal = await this.dealRepo.save(
      this.dealRepo.create({
        name: dto.name,
        prestationType: dto.prestationType,
        description: dto.description,
        amountHT,
        status: dto.status || DealStatus.NOUVELLE_AFFAIRE,
        client,
        apporteur: apporteur ?? undefined,
        realisateur: realisateur ?? undefined,
        createdBy: { id: user.userId } as any,
      }),
    );

    // Commission automatique (10 %)
    const rate = 10;
    await this.commissionRepo.save(
      this.commissionRepo.create({
        deal: { id: deal.id } as any,
        rate,
        amount: this.round2((amountHT * rate) / 100),
        beneficiary: apporteur ?? undefined,
        status: CommissionStatus.A_CALCULER,
      }),
    );

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

    if (recompute || dto.apporteurId !== undefined) {
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

  async updateStatus(id: number, status: DealStatus, user: RequestUser): Promise<Deal> {
    const deal = await this.findOneDeal(id, user);
    const previous = deal.status;
    deal.status = status;
    await this.dealRepo.save(deal);

    // Effets métier sur la commission
    if (status === DealStatus.ACOMPTE_ENCAISSE && deal.commission) {
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
};
