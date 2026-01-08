import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign, CampaignStatus } from './entities/campaign.entity';
import { User } from '../users/entities/user.entity';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class CampaignExecutionService {
  private readonly logger = new Logger(CampaignExecutionService.name);

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Exécuter une campagne et envoyer aux utilisateurs ciblés
   */
  async executeCampaign(
    campaignId: number,
  ): Promise<{ sent: number; errors: number }> {
    const campaign = await this.campaignRepo.findOne({
      where: { id: campaignId },
    });

    if (!campaign) {
      throw new Error(`Campaign #${campaignId} not found`);
    }

    this.logger.log(`Executing campaign #${campaignId}: ${campaign.name}`);

    // Récupérer les utilisateurs ciblés selon audienceType
    const targetUsers = await this.getTargetUsers(campaign.audienceType);

    this.logger.log(
      `Found ${targetUsers.length} target users for campaign #${campaignId}`,
    );

    let sentCount = 0;
    let errorCount = 0;

    // Envoyer selon le type de campagne
    for (const user of targetUsers) {
      try {
        if (campaign.type === 'EMAIL' || campaign.type === 'MIXED') {
          await this.sendEmail(user, campaign);
        }

        if (campaign.type === 'PUSH' || campaign.type === 'MIXED') {
          await this.sendPushNotification(user, campaign);
        }

        sentCount++;
      } catch (error) {
        this.logger.error(`Failed to send campaign to user ${user.id}:`, error);
        errorCount++;
      }
    }

    // Mettre à jour les statistiques de la campagne
    campaign.sent = sentCount;
    campaign.executedAt = new Date();
    // Status stays ACTIVE (or ensures it is ACTIVE)
    campaign.status = CampaignStatus.ACTIVE;
    await this.campaignRepo.save(campaign);

    this.logger.log(
      `Campaign #${campaignId} executed: ${sentCount} sent, ${errorCount} errors`,
    );

    return { sent: sentCount, errors: errorCount };
  }

  /**
   * Récupérer les utilisateurs ciblés selon le type d'audience
   */
  private async getTargetUsers(audienceType: string): Promise<User[]> {
    let query = this.userRepo.createQueryBuilder('user');

    switch (audienceType) {
      case 'CLIENTS':
        query = query
          .leftJoinAndSelect('user.clientProfile', 'clientProfile')
          .where('clientProfile.id IS NOT NULL');
        break;

      case 'EMPLOYEES':
        query = query
          .leftJoinAndSelect('user.employeeProfile', 'employeeProfile')
          .where('employeeProfile.id IS NOT NULL');
        break;

      case 'ALL':
      default:
        // Tous les utilisateurs
        break;
    }

    return query.getMany();
  }

  /**
   * Envoyer un email de campagne
   */
  private async sendEmail(user: User, campaign: Campaign): Promise<void> {
    if (!user.email) {
      this.logger.warn(`User ${user.id} has no email address`);
      return;
    }

    try {
      await this.mailService.sendCampaignEmail(user.email, {
        userName: `${user.firstName} ${user.lastName}`,
        campaignName: campaign.name,
        content: campaign.content || '',
        description: campaign.description || '',
      });

      this.logger.debug(
        `Email sent to ${user.email} for campaign #${campaign.id}`,
      );
    } catch (error) {
      this.logger.error(`Failed to send email to ${user.email}:`, error);
      throw error;
    }
  }

  /**
   * Envoyer une notification push
   */
  private async sendPushNotification(
    user: User,
    campaign: Campaign,
  ): Promise<void> {
    try {
      await this.notificationsService.create({
        userId: user.id,
        type: 'CAMPAIGN',
        title: campaign.name,
        message:
          campaign.description || campaign.content?.substring(0, 200) || '',
        data: {
          campaignId: campaign.id,
          campaignType: campaign.type,
        },
      });

      this.logger.debug(
        `Push notification sent to user ${user.id} for campaign #${campaign.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send push notification to user ${user.id}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Planifier l'exécution d'une campagne (pour les campagnes SCHEDULED)
   */
  async scheduleCampaign(campaignId: number, executeAt: Date): Promise<void> {
    // TODO: Implémenter avec un système de queue (Bull, BullMQ, etc.)
    // ou un cron job pour exécuter la campagne à la date prévue
    this.logger.log(
      `Campaign #${campaignId} scheduled for ${executeAt.toISOString()}`,
    );
  }
}
