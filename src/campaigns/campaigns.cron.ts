import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository, IsNull } from 'typeorm';
import { Campaign, CampaignStatus } from './entities/campaign.entity';
import { CampaignExecutionService } from './campaign-execution.service';

@Injectable()
export class CampaignCronService {
    private readonly logger = new Logger(CampaignCronService.name);

    constructor(
        @InjectRepository(Campaign)
        private readonly campaignRepo: Repository<Campaign>,
        private readonly campaignExecutionService: CampaignExecutionService,
    ) { }

    @Cron(CronExpression.EVERY_MINUTE)
    async handleScheduledCampaigns() {
        this.logger.debug('Checking for scheduled campaigns...');

        const now = new Date();

        const campaigns = await this.campaignRepo.find({
            where: {
                status: CampaignStatus.ACTIVE,
                startDate: LessThanOrEqual(now),
                executedAt: IsNull(),
            },
        });

        if (campaigns.length === 0) {
            return;
        }

        this.logger.log(`Found ${campaigns.length} campaigns to execute.`);

        for (const campaign of campaigns) {
            try {
                this.logger.log(`Starting execution for campaign #${campaign.id} - ${campaign.name}`);
                await this.campaignExecutionService.executeCampaign(campaign.id);

                campaign.executedAt = new Date();
                await this.campaignRepo.save(campaign);
            } catch (error) {
                this.logger.error(`Failed to auto-execute campaign #${campaign.id}`, error);
            }
        }
    }
}
