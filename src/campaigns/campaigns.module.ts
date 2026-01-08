import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { Campaign } from './entities/campaign.entity';
import { CampaignExecutionService } from './campaign-execution.service';
import { User } from '../users/entities/user.entity';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { CampaignCronService } from './campaigns.cron';

@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, User]),
    MailModule,
    NotificationsModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignExecutionService, CampaignCronService],
  exports: [CampaignsService, CampaignExecutionService],
})
export class CampaignsModule {}
