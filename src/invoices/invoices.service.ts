import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { Invoice, InvoiceType, InvoiceStatus } from './entities/invoice.entity';
import { InvoiceStatsDto } from './dto/invoice-stats.dto';
import { Project } from 'src/projects/entities/project.entity';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { PaginatedResult } from 'src/common/types/paginated-result.type';
import { User } from 'src/users/entities/user.entity';
import { MailService } from 'src/mail/mail.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getUploadPath } from 'src/common/utils/upload-path';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(createInvoiceDto: CreateInvoiceDto, user: User) {
    const { projectId, type, ...rest } = createInvoiceDto;

    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['client', 'client.user'],
    });
    if (!project) throw new NotFoundException('Projet introuvable');

    const client = project.client;
    if (!client) throw new NotFoundException('Client du projet introuvable');

    const invoice = this.invoiceRepo.create({
      ...rest,
      type: type || InvoiceType.INVOICE,
      project,
      client,
      reference: this.generateReference(type || InvoiceType.INVOICE),
      notes: rest.notes || null,
    });

    const savedInvoice = await this.invoiceRepo.save(invoice);

    // Notification in-app pour le client
    if (client.user?.id) {
      try {
        await this.notificationsService.createInvoiceNotification(
          savedInvoice.id,
          savedInvoice.reference,
          savedInvoice.type,
          client.user.id,
        );
      } catch (e) {
        console.error('Échec notification in-app:', e);
      }
    }

    // Envoi de l'email avec le fichier uploadé en pièce jointe
    try {
      const emailTo = client.user?.email || client.contactEmail;
      let fileBuffer: Buffer | undefined;
      let fileName: string | undefined;
      const uploadDir = getUploadPath();
      if (savedInvoice.fileName && existsSync(join(uploadDir, savedInvoice.fileName))) {
        fileBuffer = readFileSync(join(uploadDir, savedInvoice.fileName));
        fileName = savedInvoice.originalName || savedInvoice.fileName;
      }
      if (emailTo) {
        await this.mailService.sendInvoiceEmail(
          emailTo,
          savedInvoice,
          fileBuffer,
          fileName,
          client.user?.roles || [],
        );
      }
    } catch (e) {
      console.error('Échec envoi email facture/devis:', e);
    }

    return savedInvoice;
  }

  private generateReference(type: InvoiceType): string {
    const prefix = type === InvoiceType.QUOTE ? 'DEV' : 'FAC';
    const date = new Date();
    const year = date.getFullYear().toString().substr(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `${prefix}-${year}${month}-${random}`;
  }

  async findPaginated(
    query: QueryInvoicesDto,
  ): Promise<PaginatedResult<Invoice>> {
    const {
      page = 1,
      limit = 25,
      search,
      status,
      type,
      clientId,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = query;

    const qb = this.invoiceRepo
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.client', 'client')
      .leftJoinAndSelect('client.user', 'user')
      .leftJoinAndSelect('invoice.project', 'project');

    if (search) {
      qb.andWhere(
        '(invoice.reference LIKE :search OR user.firstName LIKE :search OR user.lastName LIKE :search OR invoice.originalName LIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (status) qb.andWhere('invoice.status = :status', { status });
    if (type) qb.andWhere('invoice.type = :type', { type });
    if (clientId) qb.andWhere('client.id = :clientId', { clientId });

    const [data, total] = await qb
      .orderBy(`invoice.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number): Promise<Invoice> {
    const invoice = await this.invoiceRepo.findOne({
      where: { id },
      relations: ['client', 'client.user', 'project', 'payment'],
    });
    if (!invoice) throw new NotFoundException(`Document #${id} introuvable`);
    return invoice;
  }

  async update(id: number, dto: UpdateInvoiceDto): Promise<Invoice> {
    const invoice = await this.findOne(id);
    const { projectId, dueDate, ...rest } = dto;

    if (projectId) {
      const project = await this.projectRepo.findOne({
        where: { id: projectId },
        relations: ['client'],
      });
      if (!project)
        throw new NotFoundException(`Projet #${projectId} introuvable`);
      invoice.project = project;
      if (project.client) invoice.client = project.client;
    }

    Object.assign(invoice, {
      ...rest,
      dueDate: dueDate ? new Date(dueDate) : invoice.dueDate,
    });

    return await this.invoiceRepo.save(invoice);
  }

  async updateStatus(id: number, status: InvoiceStatus): Promise<Invoice> {
    const invoice = await this.findOne(id);
    invoice.status = status;
    if (status === InvoiceStatus.PAID) {
      invoice.paymentDate = new Date();
    }
    return await this.invoiceRepo.save(invoice);
  }

  async remove(id: number): Promise<{ message: string }> {
    const invoice = await this.invoiceRepo.findOneBy({ id });
    if (!invoice) throw new NotFoundException(`Document #${id} introuvable`);
    await this.invoiceRepo.remove(invoice);
    return { message: `Document #${id} supprimé` };
  }

  async removeMany(
    ids: number[],
  ): Promise<{ deleted: number; notFound: number[] }> {
    const invoices = await this.invoiceRepo.find({ where: { id: In(ids) } });
    const foundIds = invoices.map((i) => i.id);
    const notFound = ids.filter((id) => !foundIds.includes(id));
    if (invoices.length) await this.invoiceRepo.remove(invoices);
    return { deleted: invoices.length, notFound };
  }

  async getGlobalStats(): Promise<InvoiceStatsDto> {
    const result = await this.invoiceRepo
      .createQueryBuilder('invoice')
      .select('SUM(CASE WHEN invoice.status = :paid AND invoice.type = :invoice THEN invoice.amount ELSE 0 END)', 'totalPaid')
      .addSelect('SUM(CASE WHEN invoice.status = :pending AND invoice.type = :invoice THEN invoice.amount ELSE 0 END)', 'totalPending')
      .addSelect('SUM(CASE WHEN invoice.type = :quote THEN invoice.amount ELSE 0 END)', 'totalQuotes')
      .addSelect('COUNT(DISTINCT invoice.client.id)', 'clientCount')
      .setParameters({
        paid: InvoiceStatus.PAID,
        pending: InvoiceStatus.PENDING,
        invoice: InvoiceType.INVOICE,
        quote: InvoiceType.QUOTE,
      })
      .getRawOne();

    const totalPaid = parseFloat(result.totalPaid) || 0;
    const totalPending = parseFloat(result.totalPending) || 0;
    const totalQuotes = parseFloat(result.totalQuotes) || 0;
    const clientCount = parseInt(result.clientCount) || 0;

    return {
      totalPaid: Math.round(totalPaid * 100) / 100,
      totalPending: Math.round(totalPending * 100) / 100,
      totalQuotes: Math.round(totalQuotes * 100) / 100,
      totalInvoices: totalPaid + totalPending,
      clientCount,
      averagePerClient: clientCount > 0 ? Math.round(((totalPaid + totalPending) / clientCount) * 100) / 100 : 0,
    };
  }

  async getClientStats(clientId: number): Promise<InvoiceStatsDto> {
    const result = await this.invoiceRepo
      .createQueryBuilder('invoice')
      .where('invoice.client.id = :clientId', { clientId })
      .select('SUM(CASE WHEN invoice.status = :paid AND invoice.type = :invoice THEN invoice.amount ELSE 0 END)', 'totalPaid')
      .addSelect('SUM(CASE WHEN invoice.status = :pending AND invoice.type = :invoice THEN invoice.amount ELSE 0 END)', 'totalPending')
      .addSelect('SUM(CASE WHEN invoice.type = :quote THEN invoice.amount ELSE 0 END)', 'totalQuotes')
      .setParameters({
        paid: InvoiceStatus.PAID,
        pending: InvoiceStatus.PENDING,
        invoice: InvoiceType.INVOICE,
        quote: InvoiceType.QUOTE,
        clientId,
      })
      .getRawOne();

    const totalPaid = parseFloat(result?.totalPaid) || 0;
    const totalPending = parseFloat(result?.totalPending) || 0;
    const totalQuotes = parseFloat(result?.totalQuotes) || 0;

    return {
      totalPaid: Math.round(totalPaid * 100) / 100,
      totalPending: Math.round(totalPending * 100) / 100,
      totalQuotes: Math.round(totalQuotes * 100) / 100,
      totalInvoices: totalPaid + totalPending,
    };
  }
}
