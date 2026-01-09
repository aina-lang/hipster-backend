import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from './entities/ticket.entity';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { Project } from 'src/projects/entities/project.entity';
import { User } from 'src/users/entities/user.entity';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { MailModule } from 'src/mail/mail.module';
import { TasksModule } from 'src/tasks/tasks.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket, ClientProfile, Project, User]),
    NotificationsModule,
    MailModule,
    TasksModule,
  ],
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}
