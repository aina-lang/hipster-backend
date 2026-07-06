import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientPortalController } from './client-portal.controller';
import { ClientPortalService } from './client-portal.service';
import { Project } from 'src/projects/entities/project.entity';
import { Ticket } from 'src/tickets/entities/ticket.entity';
import { Invoice } from 'src/invoices/entities/invoice.entity';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { User } from 'src/users/entities/user.entity';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, Ticket, Invoice, ClientProfile, User]),
    NotificationsModule,
  ],
  controllers: [ClientPortalController],
  providers: [ClientPortalService],
})
export class ClientPortalModule {}
