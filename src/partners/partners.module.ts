import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PartnersService } from './partners.service';
import { PartnersController } from './partners.controller';
import { PartnerDealsController } from './partner-deals.controller';
import { CommissionsController } from './commissions.controller';
import { Partner } from './entities/partner.entity';
import { PartnerClient } from './entities/partner-client.entity';
import { Deal } from './entities/deal.entity';
import { Commission } from './entities/commission.entity';
import { DealDocument } from './entities/deal-document.entity';
import { UsersModule } from 'src/users/users.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Partner,
      PartnerClient,
      Deal,
      Commission,
      DealDocument,
    ]),
    UsersModule,
    NotificationsModule,
  ],
  controllers: [
    PartnersController,
    PartnerDealsController,
    CommissionsController,
  ],
  providers: [PartnersService],
  exports: [PartnersService],
})
export class PartnersModule {}
