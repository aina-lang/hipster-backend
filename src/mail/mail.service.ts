import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) { }

  async sendEmail(params: {
    to: string;
    subject: string;
    template: string;
    context?: { [name: string]: any };
    attachments?: any[];
  }): Promise<void> {
    await this.mailerService.sendMail({
      to: params.to,
      subject: params.subject,
      template: params.template,
      context: params?.context,
      attachments: params.attachments,
    });
  }

  async sendProjectCreatedEmail(to: string, data: any): Promise<void> {
    await this.sendEmail({
      to,
      subject: '🎉 Nouveau Projet Créé',
      template: 'project-created',
      context: data,
    });
  }

  async sendProjectUpdatedEmail(to: string, data: any): Promise<void> {
    await this.sendEmail({
      to,
      subject: '🔄 Mise à jour du Projet',
      template: 'project-updated',
      context: data,
    });
  }

  async sendProjectCompletedEmail(to: string, data: any): Promise<void> {
    await this.sendEmail({
      to,
      subject: '✅ Projet Terminé',
      template: 'project-completed',
      context: data,
    });
  }

  async sendLoyaltyRewardEmail(to: string, data: any): Promise<void> {
    await this.sendEmail({
      to,
      subject: `🎉 Nouveau tier de fidélité: ${data.newTier}!`,
      template: 'loyalty-reward',
      context: data,
    });
  }

  async sendTaskAssignedEmail(to: string, data: any): Promise<void> {
    await this.sendEmail({
      to,
      subject: '📋 Nouvelle Tâche Assignée',
      template: 'task-assigned',
      context: data,
    });
  }

  async sendWelcomeEmail(to: string, data: any): Promise<void> {
    await this.sendEmail({
      to,
      subject: 'Bienvenue chez Hipster Studio!',
      template: 'welcome-email',
      context: data,
    });
  }

  async sendInvoiceEmail(to: string, invoice: any, pdfBuffer: Buffer): Promise<void> {
    const isQuote = invoice.type === 'quote';
    const typeLabel = isQuote ? 'Devis' : 'Facture';
    const filename = `${typeLabel}_${invoice.reference}.pdf`;

    // Format date for display
    const formatDate = (date: Date | string) => {
      if (!date) return '';
      try {
        return new Date(date).toLocaleDateString('fr-FR');
      } catch {
        return '';
      }
    };

    // Prepare items for email display
    const items = invoice.items?.map((item: any) => ({
      description: item.description || '',
      quantity: item.quantity || 0,
      unitPrice: item.unitPrice || 0,
      unit: item.unit || '',
    })) || [];

    // Calculate totals - ensure they are numbers
    const subtotal = Number(invoice.subTotal || invoice.amount || 0);
    const tax = Number(invoice.taxAmount || 0);

    // TODO: Replace with actual URLs from environment variables or config
    const baseUrl = process.env.FRONTEND_URL || 'https://app.hipster-studio.com';
    const invoiceUrl = `${baseUrl}/invoices/${invoice.id}`;
    const pdfDownloadUrl = `${baseUrl}/api/invoices/${invoice.id}/pdf`;

    // Mobile app URL - can be configured via environment variable
    // Format: hypster://invoice/{id} or https://app.hipster-studio.com/invoice/{id}
    const mobileAppUrl = process.env.MOBILE_APP_URL
      ? `${process.env.MOBILE_APP_URL}/invoice/${invoice.id}`
      : undefined;

    await this.sendEmail({
      to,
      subject: `📄 Votre ${typeLabel} ${invoice.reference} est disponible`,
      template: 'invoice-created',
      context: {
        clientName: invoice.clientSnapshot?.name || invoice.client?.user?.firstName || 'Client',
        typeLabel,
        invoiceReference: invoice.reference,
        projectName: invoice.projectSnapshot?.name || invoice.project?.name,
        amount: Number(invoice.amount || 0).toFixed(2),
        dueDate: formatDate(invoice.dueDate),
        status: invoice.status,
        items,
        subtotal: subtotal.toFixed(2),
        tax: tax.toFixed(2),
        notes: invoice.notes,
        invoiceUrl,
        pdfDownloadUrl,
        mobileAppUrl,
      },
      attachments: [
        {
          filename,
          content: pdfBuffer,
        },
      ],
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
      subject: '📋 Nouveau projet soumis par un client',
      template: 'project-submission',
      context: data,
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
      subject: '🎫 Nouveau ticket créé par un client',
      template: 'ticket-creation',
      context: data,
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
    },
  ): Promise<void> {
    await this.sendEmail({
      to,
      subject: '👥 Vous avez été assigné à un projet',
      template: 'project-assignment',
      context: data,
    });
  }
  async sendOtpEmail(to: string, data: { name: string; code: string }): Promise<void> {
    await this.sendEmail({
      to,
      subject: '🔑 Votre code de vérification Hipster',
      template: 'otp-email', // Ensure this template exists or reusing the one from register
      context: data,
    });
  }

  async sendNewPasswordEmail(to: string, data: { name: string; password: string }): Promise<void> {
    await this.sendEmail({
      to,
      subject: '🔒 Votre nouveau mot de passe Hipster',
      template: 'password-reset', // You might need to create this template or use a generic one
      context: data,
    });
  }

  async sendCampaignEmail(to: string, data: { 
    userName: string; 
    campaignName: string; 
    content: string; 
    description?: string;
  }): Promise<void> {
    await this.sendEmail({
      to,
      subject: data.campaignName,
      template: 'campaign',
      context: data,
    });
  }
}
