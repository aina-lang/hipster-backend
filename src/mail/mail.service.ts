import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { CompanyService } from '../company/company.service';

@Injectable()
export class MailService {
  constructor(
    private readonly mailerService: MailerService,
    private readonly companyService: CompanyService,
  ) {}

  async sendEmail(params: {
    to: string;
    subject: string;
    template: string;
    context?: { [name: string]: any };
    attachments?: any[];
    userRoles?: string[];
  }): Promise<void> {
    const company = await this.companyService.getProfile();

    const isAdminOrEmployee = params.userRoles?.some(
      (r) => r === 'admin' || r === 'employee',
    );

    // Dynamic URLs based on roles
    const backofficeUrl = (
      process.env.BACKOFFICE_URL || 'https://hipster-ia.fr/app/dashboard'
    ).replace(/\/+$/, '');
    const frontendUrl = (
      process.env.FRONTEND_URL || 'https://hipster-ia.fr'
    ).replace(/\/+$/, '');

    let apiUrl = (process.env.API_URL || 'https://hipster-api.fr').replace(
      /\/+$/,
      '',
    );
    // Sanity check: if apiUrl is just a protocol or too short, fallback
    if (apiUrl.length < 10 && !apiUrl.includes('.')) {
      apiUrl = 'https://hipster-api.fr';
    }

    const mobileUrl = process.env.MOBILE_APP_URL || 'hipster://login';

    // Determine the primary app URL
    let appUrl = frontendUrl;
    if (isAdminOrEmployee) {
      appUrl = backofficeUrl;
    } else if (params.userRoles?.includes('client_marketing')) {
      // Prioritize mobile for marketing clients if they have the app
      appUrl = mobileUrl;
    }

    // Force absolute URL for logo with robust cleaning
    let companyLogoUrl: string | null = null;
    if (company.logoUrl) {
      if (company.logoUrl.startsWith('http')) {
        companyLogoUrl = company.logoUrl;
      } else {
        // Ensure logoUrl starts with / and apiUrl doesn't end with /
        const cleanLogoPath = company.logoUrl.startsWith('/')
          ? company.logoUrl
          : `/${company.logoUrl}`;
        companyLogoUrl = `${apiUrl}${cleanLogoPath}`;
      }
    }

    const globalContext = {
      companyName: company.name,
      companyAddress: company.address,
      companyCity: company.city,
      companyZipCode: company.zipCode,
      companyCountry: company.country,
      companyPhone: company.phone,
      companyEmail: company.email,
      companyWebsite: company.website,
      companyLogoUrl: companyLogoUrl,
      currentYear: new Date().getFullYear(),
      appUrl: appUrl,
      // dashboardUrl: appUrl, // 🚫 DISABLED: User requested to remove all "Access Account" links by default
    };

    await this.mailerService.sendMail({
      to: params.to,
      subject: params.subject,
      template: params.template,
      context: { ...globalContext, ...(params.context || {}) },
      attachments: params.attachments,
    });
  }

  async sendProjectCreatedEmail(
    to: string,
    data: any,
    roles?: string[],
  ): Promise<void> {
    await this.sendEmail({
      to,
      subject: 'Nouveau Projet Créé',
      template: 'project-created',
      context: data,
      userRoles: roles,
    });
  }

  async sendProjectUpdatedEmail(
    to: string,
    data: any,
    roles?: string[],
  ): Promise<void> {
    await this.sendEmail({
      to,
      subject: 'Mise à jour du Projet',
      template: 'project-updated',
      context: data,
      userRoles: roles,
    });
  }

  async sendProjectCompletedEmail(
    to: string,
    data: any,
    roles?: string[],
  ): Promise<void> {
    await this.sendEmail({
      to,
      subject: 'Projet Terminé',
      template: 'project-completed',
      context: data,
      userRoles: roles,
    });
  }

  async sendLoyaltyRewardEmail(
    to: string,
    data: any,
    roles?: string[],
  ): Promise<void> {
    await this.sendEmail({
      to,
      subject: `Nouveau tier de fidélité: ${data.newTier}!`,
      template: 'loyalty-reward',
      context: data,
      userRoles: roles,
    });
  }

  async sendTaskAssignedEmail(
    to: string,
    data: any,
    roles?: string[],
  ): Promise<void> {
    await this.sendEmail({
      to,
      subject: 'Nouvelle Tâche Assignée',
      template: 'task-assigned',
      context: data,
      userRoles: roles || ['employee'],
    });
  }

  async sendMaintenanceAssignedEmail(
    to: string,
    data: any,
    roles?: string[],
  ): Promise<void> {
    await this.sendEmail({
      to,
      subject: 'Tâche de Maintenance Assignée',
      template: 'maintenance-assigned',
      context: data,
      userRoles: roles || ['employee'],
    });
  }

  async sendWelcomeEmail(
    to: string,
    data: any,
    roles?: string[],
  ): Promise<void> {
    const isClient = roles?.includes('client_marketing');
    const isEmployee = roles?.includes('employee');
    const isAdmin = roles?.includes('admin');

    let welcomeMessage = 'Bienvenue sur la plateforme Hipster.';
    let subMessage = '';

    if (isAdmin) {
      welcomeMessage = 'Votre compte Administrateur a été créé avec succès.';
      subMessage =
        "Vous avez désormais accès à l'ensemble des fonctionnalités de gestion.";
    } else if (isEmployee) {
      welcomeMessage = 'Votre compte Employé est prêt.';
      subMessage =
        'Rapprochez-vous de votre manager pour obtenir vos accès et missions.';
    } else if (isClient) {
      welcomeMessage = 'Bienvenue chez Hipster Marketing !';
      subMessage = 'Nous sommes ravis de collaborer avec vous.';
    }

    await this.sendEmail({
      to,
      subject: 'Bienvenue chez Hipster Studio!',
      template: 'welcome-email',
      context: {
        ...data,
        welcomeMessage,
        subMessage,
        // 🚫 REMOVED LINK: Explicitly removing dashboardUrl to prevents "Access Account" button
        dashboardUrl: null,
        actionUrl: null,
      },
      userRoles: roles,
    });
  }

  async sendInvoiceEmail(
    to: string,
    invoice: any,
    fileBuffer?: Buffer,
    fileName?: string,
    roles?: string[],
  ): Promise<void> {
    const isQuote = invoice.type === 'quote';
    const typeLabel = isQuote ? 'Devis' : 'Facture';

    const formatDate = (date: Date | string) => {
      if (!date) return '';
      try {
        return new Date(date).toLocaleDateString('fr-FR');
      } catch {
        return '';
      }
    };

    const baseUrl = process.env.FRONTEND_URL || 'https://hipster-ia.fr';
    const invoiceUrl = `${baseUrl}/invoices/${invoice.id}`;

    const context: any = {
      clientName:
        invoice.client?.user?.firstName ||
        invoice.client?.companyName ||
        'Client',
      typeLabel,
      invoiceReference: invoice.reference,
      projectName: invoice.project?.name || '',
      amount: Number(invoice.amount || 0).toFixed(2),
      dueDate: formatDate(invoice.dueDate),
      status: invoice.status,
      notes: invoice.notes || '',
      invoiceUrl,
      hasFile: !!fileBuffer,
    };

    const attachments: any[] = [];
    if (fileBuffer) {
      attachments.push({
        filename: fileName || `${typeLabel}_${invoice.reference}`,
        content: fileBuffer,
      });
    }

    await this.sendEmail({
      to,
      userRoles: roles,
      subject: `Votre ${typeLabel} ${invoice.reference} est disponible`,
      template: 'invoice-created',
      context,
      attachments,
    });
  }

  /**
   * Email pour la soumission d'un projet par un client
   */
  async sendProjectSubmissionEmail(
    to: string,
    data: {
      adminName: string;
      projectName: string;
      clientName: string;
      projectDescription?: string;
    },
  ): Promise<void> {
    await this.sendEmail({
      to,
      subject: 'Nouveau projet soumis par un client',
      template: 'project-submission',
      context: data,
      userRoles: ['admin'],
    });
  }

  /**
   * Email pour la création d'un ticket par un client
   */
  async sendTicketCreationEmail(
    to: string,
    data: {
      adminName: string;
      ticketTitle: string;
      clientName: string;
      ticketDescription?: string;
      priority?: string;
    },
  ): Promise<void> {
    await this.sendEmail({
      to,
      subject: 'Nouveau ticket créé par un client',
      template: 'ticket-creation',
      context: data,
      userRoles: ['admin'],
    });
  }

  /**
   * Email pour l'assignation d'un membre à un projet
   */
  async sendProjectAssignmentEmail(
    to: string,
    data: {
      memberName: string;
      projectName: string;
      projectDescription?: string;
      role?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<void> {
    await this.sendEmail({
      to,
      subject: 'Vous avez été assigné à un projet',
      template: 'project-assignment',
      context: data,
      userRoles: ['employee'],
    });
  }
  async sendOtpEmail(
    to: string,
    data: { name: string; code: string },
    roles?: string[],
  ): Promise<void> {
    await this.sendEmail({
      to,
      subject: 'Votre code de vérification Hipster',
      template: 'otp-email',
      context: data,
      userRoles: roles,
    });
  }

  async sendNewPasswordEmail(
    to: string,
    data: { name: string; password: string },
    roles?: string[],
  ): Promise<void> {
    await this.sendEmail({
      to,
      subject: 'Votre nouveau mot de passe Hipster',
      template: 'password-reset',
      context: {
        ...data,
        // 🚫 REMOVED LINK
        dashboardUrl: null,
      },
      userRoles: roles,
    });
  }

  async sendCampaignEmail(
    to: string,
    data: {
      userName: string;
      campaignName: string;
      content: string;
      description?: string;
    },
  ): Promise<void> {
    await this.sendEmail({
      to,
      subject: data.campaignName,
      template: 'campaign',
      context: data,
      userRoles: ['client_marketing'],
    });
  }

  /**
   * Email pour le refus d'un projet avec motif
   */
  async sendProjectRefusalEmail(
    to: string,
    data: {
      clientName: string;
      projectName: string;
      reason: string;
      projectUrl: string;
    },
    roles?: string[],
  ): Promise<void> {
    await this.sendEmail({
      to,
      subject: `Projet refusé - ${data.projectName}`,
      template: 'project-refusal',
      context: data,
      userRoles: roles,
    });
  }

  /**
   * Email pour l'annulation d'un projet
   */
  async sendProjectCancelledEmail(
    to: string,
    data: {
      clientName: string;
      projectName: string;
      projectUrl: string;
    },
    roles?: string[],
  ): Promise<void> {
    await this.sendEmail({
      to,
      subject: `Projet annulé - ${data.projectName}`,
      template: 'project-cancelled',
      context: data,
      userRoles: roles,
    });
  }

  /**
   * Email pour l'acceptation d'un ticket
   */
  async sendTicketAcceptedEmail(
    to: string,
    data: {
      clientName: string;
      ticketTitle: string;
      projectName?: string;
    },
    roles?: string[],
  ): Promise<void> {
    await this.sendEmail({
      to,
      subject: `Ticket Accepté - ${data.ticketTitle}`,
      template: 'ticket-accepted',
      context: data,
      userRoles: roles,
    });
  }

  /**
   * Email pour le refus d'un ticket
   */
  async sendTicketResolvedEmail(
    to: string,
    data: {
      clientName: string;
      ticketTitle: string;
      projectName?: string;
    },
    roles?: string[],
  ): Promise<void> {
    await this.sendEmail({
      to,
      subject: `Ticket Résolu - ${data.ticketTitle}`,
      template: 'ticket-resolved',
      context: data,
      userRoles: roles,
    });
  }

  async sendTicketRejectedEmail(
    to: string,
    data: {
      clientName: string;
      ticketTitle: string;
      reason?: string;
    },
    roles?: string[],
  ): Promise<void> {
    await this.sendEmail({
      to,
      subject: `Ticket Refusé - ${data.ticketTitle}`,
      template: 'ticket-rejected',
      context: data,
      userRoles: roles,
    });
  }
}
