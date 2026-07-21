import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as pug from 'pug';
import { join } from 'path';

@Injectable()
export class KookMailService {
  private readonly logger = new Logger(KookMailService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: 'merciaaina@gmail.com',
        pass: 'ajtq epxx oqkm asir',
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }

  private renderTemplate(templateName: string, context: Record<string, any>): string {
    const templatePath = join(process.cwd(), 'src', 'templates', `${templateName}.pug`);
    const html = pug.renderFile(templatePath, context);
    return html;
  }

  async sendOtpEmail(to: string, data: { name: string; code: string }): Promise<void> {
    try {
      const html = this.renderTemplate('kook-otp-email', {
        name: data.name,
        code: data.code,
        expiryMinutes: 5,
      });

      await this.transporter.sendMail({
        to,
        subject: '🔑 Votre code de vérification Kook',
        from: '"Kook - Recettes" <merciaaina@gmail.com>',
        html,
      });

      this.logger.log(`OTP email sent to ${to}`);
    } catch (error: any) {
      this.logger.error(`Erreur envoi OTP à ${to}: ${error?.message || error}`);
      throw new Error(`Impossible d'envoyer l'email: ${error?.message || 'erreur inconnue'}`);
    }
  }

  async sendWelcomeEmail(to: string, data: { name: string }): Promise<void> {
    try {
      const html = this.renderTemplate('kook-welcome-email', {
        name: data.name,
      });

      await this.transporter.sendMail({
        to,
        subject: 'Bienvenue sur Kook !',
        from: '"Kook - Recettes" <merciaaina@gmail.com>',
        html,
      });

      this.logger.log(`Welcome email sent to ${to}`);
    } catch (error: any) {
      this.logger.error(`Erreur envoi welcome à ${to}: ${error?.message || error}`);
      throw new Error(`Impossible d'envoyer l'email: ${error?.message || 'erreur inconnue'}`);
    }
  }
}
