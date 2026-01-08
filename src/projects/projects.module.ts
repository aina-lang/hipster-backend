import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';

import { Project } from './entities/project.entity';
import { ProjectMember } from './entities/project-member.entity';
import { File } from 'src/files/entities/file.entity';
import { Task } from 'src/tasks/entities/task.entity';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { EmployeeProfile } from 'src/profiles/entities/employee-profile.entity';
import { User } from 'src/users/entities/user.entity';
import { ClientWebsite } from 'src/profiles/entities/client-website.entity';
import { Permission } from 'src/permissions/entities/permission.entity';

import { LoyaltyModule } from 'src/loyalty/loyalty.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { MailModule } from 'src/mail/mail.module';

import { Invoice } from 'src/invoices/entities/invoice.entity';
import { Payment } from 'src/payments/entities/payment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Project,
      ProjectMember,
      File,
      Task,
      ClientProfile,
      EmployeeProfile,
      User,
      Invoice,
      Payment,
      ClientWebsite,
      Permission,
    ]),
    LoyaltyModule,
    NotificationsModule,
    MailModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
