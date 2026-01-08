import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { Invoice, InvoiceType, InvoiceStatus } from './entities/invoice.entity';
import { InvoiceItem } from './entities/invoice-item.entity';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { Project } from 'src/projects/entities/project.entity';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { PaginatedResult } from 'src/common/types/paginated-result.type';
import { User } from 'src/users/entities/user.entity';
import { CompanyService } from 'src/company/company.service';

import { MailService } from 'src/mail/mail.service';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(InvoiceItem)
    private readonly invoiceItemRepo: Repository<InvoiceItem>,
    @InjectRepository(ClientProfile)
    private readonly clientRepo: Repository<ClientProfile>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    private readonly companyService: CompanyService,
    private readonly mailService: MailService,
  ) { }

  async create(createInvoiceDto: CreateInvoiceDto, user: User) {
    const { clientId, projectId, items, ...invoiceData } = createInvoiceDto;

    const client = await this.clientRepo.findOne({
      where: { id: clientId },
      relations: ['user'],
    });
    if (!client) throw new NotFoundException('Client not found');

    const project = await this.projectRepo.findOne({
      where: { id: projectId },
    });
    if (!project) throw new NotFoundException('Project not found');

    // Calculate totals
    let subTotal = 0;
    const invoiceItems = items.map((item) => {
      const total = item.quantity * item.unitPrice;
      subTotal += total;
      return this.invoiceItemRepo.create({
        ...item,
        total,
      });
    });

    // Logic for TVA based on user request "TVA non applicable - Art. 293 B du CGI"
    // If tva is false, taxRate is 0.
    const taxRate = invoiceData.tva ? 20 : 0;
    const taxAmount = (subTotal * taxRate) / 100;
    const discountAmount = invoiceData.discount || 0;
    const totalAmount = subTotal + taxAmount - discountAmount;

    // Create snapshots
    const clientSnapshot = {
      id: client.id,
      name:
        client.companyName ||
        `${client.user?.firstName} ${client.user?.lastName}`,
      company: client.companyName,
      address: client.billingAddress || 'Adresse non renseignée',
      city: client.city,
      zipCode: client.zipCode,
      country: client.country,
      siret: client.siret || '53751244400028', // Fallback to example if empty
      tvaNumber: client.tvaNumber,
      email: client.user?.email,
    };

    const projectSnapshot = {
      id: project.id,
      name: project.name,
      description: project.description,
    };

    // Sender Details (Platform/Admin) - Use Company Profile
    const companyProfile = await this.companyService.getProfile();
    const senderDetails = {
      companyName: companyProfile.name || 'DEVERT LISE',
      commercialName: companyProfile.name || 'HIPSTER MARKETING',
      siret: companyProfile.siret || '85164648900019',
      address:
        companyProfile.address ||
        '11 RUE DE LA FRAPPIERE, 86100 POITIERS, FRANCE',
      email: companyProfile.email || 'lise.devert@gmail.com',
      phone: companyProfile.phone || '+33 6 37 37 13 00',
      paymentDetails: {
        mode: 'Virement',
        iban: companyProfile.iban || 'FR76 3000 4027 1100 0105 5231 78',
        bic: companyProfile.bic || 'BNPAFRPPXXX',
        bank: companyProfile.bankName || 'BNP PARIBAS',
      },
    };

    const invoice = this.invoiceRepo.create({
      ...invoiceData,
      client,
      project,
      items: invoiceItems,
      subTotal,
      taxRate,
      taxAmount,
      amount: totalAmount,
      clientSnapshot,
      projectSnapshot,
      senderDetails,
      reference:
        invoiceData.reference || this.generateReference(invoiceData.type),
      notes: invoiceData.notes || 'TVA non applicable - Art. 293 B du CGI', // Default note if no TVA
    });

    const savedInvoice = await this.invoiceRepo.save(invoice);

    // Generate PDF and send email
    try {
      const pdfBuffer = await this.generatePdf(savedInvoice.id);
      if (client.user?.email) {
        await this.mailService.sendInvoiceEmail(
          client.user.email,
          savedInvoice,
          pdfBuffer,
          client.user.roles,
        );
      }
    } catch (error) {
      console.error('Failed to send invoice email:', error);
      // Don't fail the request if email sending fails
    }

    return savedInvoice;
  }

  /**
   * Convert an accepted quote to an invoice
   */
  async convertQuoteToInvoice(quoteId: number, user: User): Promise<Invoice> {
    // Fetch the quote with all relations
    const quote = await this.invoiceRepo.findOne({
      where: { id: quoteId },
      relations: ['client', 'client.user', 'project', 'items'],
    });

    if (!quote) {
      throw new NotFoundException(`Devis #${quoteId} introuvable`);
    }

    // Validate it's a quote
    if (quote.type !== InvoiceType.QUOTE) {
      throw new NotFoundException("Ce document n'est pas un devis");
    }

    // Validate it's accepted
    if (quote.status !== 'accepted') {
      throw new NotFoundException(
        'Le devis doit être accepté avant conversion',
      );
    }

    // Validate it hasn't been converted already
    if (quote.convertedToInvoiceId) {
      throw new NotFoundException('Ce devis a déjà été converti en facture');
    }

    // Create new invoice based on quote
    const invoiceItems = quote.items.map((item) =>
      this.invoiceItemRepo.create({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unit: item.unit,
        total: item.total,
      }),
    );

    const invoice = this.invoiceRepo.create({
      type: InvoiceType.INVOICE,
      status: InvoiceStatus.PENDING,
      client: quote.client,
      project: quote.project,
      items: invoiceItems,
      subTotal: quote.subTotal,
      taxRate: quote.taxRate,
      taxAmount: quote.taxAmount,
      amount: quote.amount,
      tva: quote.tva,
      discount: quote.discount,
      dueDate: quote.dueDate,
      notes: quote.notes,
      terms: quote.terms,
      clientSnapshot: quote.clientSnapshot,
      projectSnapshot: quote.projectSnapshot,
      senderDetails: quote.senderDetails,
      reference: this.generateReference(InvoiceType.INVOICE),
      convertedFromQuoteId: quote.id,
    });

    const savedInvoice = await this.invoiceRepo.save(invoice);

    // Update the quote to mark it as converted
    quote.convertedToInvoiceId = savedInvoice.id;
    await this.invoiceRepo.save(quote);

    // Generate PDF and send email
    try {
      const pdfBuffer = await this.generatePdf(savedInvoice.id);
      if (quote.client?.user?.email) {
        await this.mailService.sendInvoiceEmail(
          quote.client.user.email,
          savedInvoice,
          pdfBuffer,
          quote.client.user.roles,
        );
      }
    } catch (error) {
      console.error('Failed to send invoice email:', error);
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

  async generatePdf(id: number): Promise<Buffer> {
    const invoice = await this.findOne(id);
    if (!invoice) throw new NotFoundException('Invoice not found');

    const puppeteer = require('puppeteer');

    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.CHROME_BIN || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
      ],
    });

    try {
      console.log('Chromium version:', await browser.version());

      const page = await browser.newPage();

      const htmlContent = this.getInvoiceHtml(invoice);

      // Save HTML for debugging
      try {
        require('fs').writeFileSync('./invoice-debug.html', htmlContent);
        console.log('HTML saved to invoice-debug.html');
      } catch (e) {
        console.warn('Could not save debug HTML');
      }

      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0',
        timeout: 60000,
      });

      // CRITICAL: Set media type to screen
      await page.emulateMediaType('screen');

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px',
        },
      });

      // Verify it's a valid PDF
      const bufferStart = Buffer.from(pdfBuffer).slice(0, 20).toString();
      console.log('PDF buffer start:', bufferStart);

      if (!bufferStart.startsWith('%PDF')) {
        console.error('Generated buffer is not a PDF!');
        throw new Error('Generated PDF is invalid');
      }

      await browser.close();
      return Buffer.from(pdfBuffer);
    } catch (error) {
      console.error('PDF generation error:', error);
      await browser.close();
      throw error;
    }
  }

  private getInvoiceHtml(invoice: Invoice): string {
    const {
      reference,
      issueDate,
      dueDate,
      paymentDate,
      clientSnapshot,
      senderDetails,
      items,
      subTotal,
      taxAmount,
      amount,
      type,
      notes,
    } = invoice;

    const typeLabel = type === InvoiceType.QUOTE ? 'DEVIS' : 'FACTURE';
    const formatDate = (date: Date | string) => {
      if (!date) return '';
      try {
        return new Date(date).toLocaleDateString('fr-FR');
      } catch {
        return '';
      }
    };
    const formatMoney = (value: number | string) => {
      const num = Number(value) || 0;
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
      }).format(num);
    };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: 'Helvetica', sans-serif; color: #333; line-height: 1.5; font-size: 14px; }
          .container { max-width: 800px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
          .logo { font-size: 24px; font-weight: bold; color: #000; text-transform: uppercase; }
          .invoice-details { text-align: right; }
          .invoice-details h1 { margin: 0; font-size: 28px; color: #000; }
          .addresses { display: flex; justify-content: space-between; margin-bottom: 40px; gap: 20px; }
          .box { flex: 1; padding: 20px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef; }
          .box-title { font-size: 12px; text-transform: uppercase; color: #6c757d; margin-bottom: 10px; font-weight: bold; letter-spacing: 1px; }
          .company-name { font-weight: bold; font-size: 16px; margin-bottom: 5px; display: block; }
          
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { text-align: left; padding: 12px; background: #212529; color: #fff; font-size: 12px; text-transform: uppercase; }
          td { padding: 12px; border-bottom: 1px solid #dee2e6; }
          tr:last-child td { border-bottom: none; }
          
          .totals-section { display: flex; justify-content: flex-end; margin-bottom: 40px; }
          .totals-table { width: 300px; }
          .totals-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
          .totals-row.final { border-top: 2px solid #000; border-bottom: none; font-weight: bold; font-size: 16px; margin-top: 10px; padding-top: 10px; }
          
          .payment-info { margin-top: 40px; padding: 20px; background: #f8f9fa; border-radius: 8px; font-size: 13px; }
          .payment-info h3 { margin-top: 0; font-size: 14px; text-transform: uppercase; }
          
          .footer { margin-top: 60px; text-align: center; font-size: 11px; color: #6c757d; border-top: 1px solid #dee2e6; padding-top: 20px; }
          
          .status-badge { 
            display: inline-block; padding: 5px 10px; border-radius: 4px; font-size: 12px; font-weight: bold; text-transform: uppercase;
            background: ${invoice.status === 'paid' ? '#d4edda' : '#fff3cd'};
            color: ${invoice.status === 'paid' ? '#155724' : '#856404'};
            margin-top: 10px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div>
              <div class="logo">${senderDetails?.commercialName || 'HIPSTER MARKETING'}</div>
              <div style="font-size: 12px; color: #666; margin-top: 5px;">${senderDetails?.companyName}</div>
            </div>
            <div class="invoice-details">
              <h1>${typeLabel}</h1>
              <p style="margin: 5px 0;">N° ${reference}</p>
              <p style="margin: 5px 0;">Date : ${formatDate(issueDate)}</p>
              ${paymentDate ? `<p style="margin: 5px 0;">Date de paiement : ${formatDate(paymentDate)}</p>` : ''}
              <div class="status-badge">${invoice.status === 'paid' ? 'Facture payée' : 'En attente'}</div>
            </div>
          </div>

          <div class="addresses">
            <div class="box">
              <div class="box-title">Fournisseur</div>
              <span class="company-name">${senderDetails?.companyName || 'HIPSTER MARKETING'}</span>
              ${senderDetails?.commercialName ? `<div>${senderDetails.commercialName}</div>` : ''}
              <div>${senderDetails?.address || ''}</div>
              <div style="margin-top: 10px;">
                SIRET : ${senderDetails?.siret || 'N/A'}<br>
                Email : ${senderDetails?.email || 'N/A'}<br>
                Tél : ${senderDetails?.phone || 'N/A'}
              </div>
            </div>
            <div class="box">
              <div class="box-title">Client</div>
              <span class="company-name">${clientSnapshot?.name || 'Client'}</span>
              <div>${clientSnapshot?.address || ''}</div>
              ${clientSnapshot?.siret ? `<div style="margin-top: 10px;">SIRET : ${clientSnapshot.siret}</div>` : ''}
              ${clientSnapshot?.email ? `<div>Email : ${clientSnapshot.email}</div>` : ''}
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 50%">Désignation</th>
                <th style="text-align: right;">Qté</th>
                <th style="text-align: right;">Prix Unit. HT</th>
                <th style="text-align: right;">Total HT</th>
              </tr>
            </thead>
            <tbody>
              ${(items || [])
        .map((item) => {
          const qty = Number(item.quantity) || 0;
          const price = Number(item.unitPrice) || 0;
          const total = qty * price;
          return `
                <tr>
                  <td>
                    <strong>${item.description || ''}</strong>
                    ${item.unit ? `<div style="font-size: 12px; color: #666; margin-top: 4px;">${item.unit}</div>` : ''}
                  </td>
                  <td style="text-align: right;">${qty}</td>
                  <td style="text-align: right;">${formatMoney(price)}</td>
                  <td style="text-align: right;">${formatMoney(total)}</td>
                </tr>
              `;
        })
        .join('')}
            </tbody>
          </table>

          <div class="totals-section">
            <div class="totals-table">
              <div class="totals-row">
                <span>Total HT</span>
                <span>${formatMoney(Number(subTotal))}</span>
              </div>
              ${invoice.tva
        ? `
              <div class="totals-row">
                <span>TVA (20%)</span>
                <span>${formatMoney(Number(taxAmount))}</span>
              </div>
              `
        : ''
      }
              <div class="totals-row final">
                <span>Total TTC</span>
                <span>${formatMoney(Number(amount))}</span>
              </div>
              <div style="font-size: 11px; color: #666; margin-top: 5px; text-align: right;">
                Devise : EUR
              </div>
            </div>
          </div>

          ${notes ? `<div style="margin-bottom: 20px; font-style: italic;">${notes}</div>` : ''}

          ${senderDetails?.paymentDetails
        ? `
          <div class="payment-info">
            <h3>Mode de paiement : ${senderDetails.paymentDetails.mode}</h3>
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 10px 20px;">
              <div><strong>IBAN :</strong></div>
              <div>${senderDetails.paymentDetails.iban}</div>
              <div><strong>BIC :</strong></div>
              <div>${senderDetails.paymentDetails.bic}</div>
              <div><strong>Banque :</strong></div>
              <div>${senderDetails.paymentDetails.bank}</div>
            </div>
          </div>
          `
        : ''
      }

          <div class="footer">
            <p>${senderDetails?.companyName} - ${senderDetails?.commercialName}</p>
            <p>SIRET : ${senderDetails?.siret} - Adresse : ${senderDetails?.address}</p>
          </div>
        </div>
      </body>
      </html>
    `;
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
      projectId,
      sortBy = 'dueDate',
      sortOrder = 'DESC',
    } = query;

    const qb = this.invoiceRepo
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.client', 'client')
      .leftJoinAndSelect('invoice.project', 'project')
      .leftJoinAndSelect('client.user', 'user');

    if (search) {
      qb.andWhere(
        '(invoice.reference LIKE :search OR project.name LIKE :search OR user.firstName LIKE :search OR user.lastName LIKE :search)',
        {
          search: `%${search}%`,
        },
      );
    }

    if (status) qb.andWhere('invoice.status = :status', { status });
    if (type) qb.andWhere('invoice.type = :type', { type });
    if (clientId) qb.andWhere('client.id = :clientId', { clientId });
    if (projectId) qb.andWhere('project.id = :projectId', { projectId });

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
      relations: ['client', 'client.user', 'project', 'items'],
    });
    if (!invoice) throw new NotFoundException(`Facture #${id} introuvable`);
    return invoice;
  }

  async update(id: number, dto: UpdateInvoiceDto): Promise<Invoice> {
    const invoice = await this.findOne(id);
    const { clientId, projectId, dueDate, items, ...rest } = dto;

    if (clientId) {
      const client = await this.clientRepo.findOneBy({ id: clientId });
      if (!client)
        throw new NotFoundException(`Client #${clientId} introuvable`);
      invoice.client = client;
    }

    if (projectId) {
      const project = await this.projectRepo.findOneBy({ id: projectId });
      if (!project)
        throw new NotFoundException(`Projet #${projectId} introuvable`);
      invoice.project = project;
    }

    // Handle items update if provided
    if (items) {
      // Remove existing items
      await this.invoiceItemRepo.delete({ invoice: { id } });

      // Create new items with calculated totals
      const newItems = items.map((item) => {
        const total = item.quantity * item.unitPrice;
        return this.invoiceItemRepo.create({
          ...item,
          total,
        });
      });

      invoice.items = newItems;

      // Recalculate invoice totals
      const subTotal = newItems.reduce((sum, item) => sum + item.total, 0);

      // Check if TVA setting changed or use existing
      const hasTva = rest.tva !== undefined ? rest.tva : invoice.tva;
      const taxRate = hasTva ? 20 : 0;
      const taxAmount = (subTotal * taxRate) / 100;
      const discount = rest.discount !== undefined ? rest.discount : (invoice.discount || 0);
      const amount = subTotal + taxAmount - discount;

      invoice.subTotal = subTotal;
      invoice.taxRate = taxRate;
      invoice.taxAmount = taxAmount;
      invoice.amount = amount;
    } else {
      // Recalculate totals even if items didn't change but TVA or Discount did
      // NOTE: This assumes items are already loaded on 'invoice' from findOne
      let needsRecalc = false;
      if (rest.tva !== undefined && rest.tva !== invoice.tva) needsRecalc = true;
      if (rest.discount !== undefined && rest.discount !== invoice.discount) needsRecalc = true;

      if (needsRecalc) {
        const subTotal = invoice.items.reduce((sum, item) => sum + item.total, 0);
        const hasTva = rest.tva !== undefined ? rest.tva : invoice.tva;
        const taxRate = hasTva ? 20 : 0;
        const taxAmount = (subTotal * taxRate) / 100;
        const discount = rest.discount !== undefined ? rest.discount : (invoice.discount || 0);

        invoice.subTotal = subTotal;
        invoice.taxRate = taxRate;
        invoice.taxAmount = taxAmount;
        invoice.amount = subTotal + taxAmount - discount;
      }
    }

    Object.assign(invoice, {
      ...rest,
      dueDate: dueDate ? new Date(dueDate) : invoice.dueDate,
    });

    const savedInvoice = await this.invoiceRepo.save(invoice);

    // Generate PDF and send email
    try {
      const pdfBuffer = await this.generatePdf(savedInvoice.id);
      if (invoice.client?.user?.email) {
        await this.mailService.sendInvoiceEmail(
          invoice.client.user.email,
          savedInvoice,
          pdfBuffer,
          invoice.client.user.roles,
        );
      }
    } catch (error) {
      console.error('Failed to send invoice email:', error);
    }

    return savedInvoice;
  }

  async remove(id: number): Promise<{ message: string }> {
    const invoice = await this.invoiceRepo.findOneBy({ id });
    if (!invoice) throw new NotFoundException(`Facture #${id} introuvable`);
    await this.invoiceRepo.remove(invoice);
    return { message: `Facture #${id} supprimée` };
  }
}
