import { Module, forwardRef } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from './entities/task.entity';
import { ProjectsModule } from 'src/projects/projects.module';
import { User } from 'src/users/entities/user.entity';
import { Project } from 'src/projects/entities/project.entity';
import { EmployeeProfile } from 'src/profiles/entities/employee-profile.entity';
import { Permission } from 'src/permissions/entities/permission.entity';
import { ClientWebsite } from 'src/profiles/entities/client-website.entity';

import { MailModule } from 'src/mail/mail.module';
import { RecurringTasksModule } from './recurring-tasks/recurring-tasks.module';
import { Ticket } from 'src/tickets/entities/ticket.entity';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Task,
      User,
      Project,
      EmployeeProfile,
      Permission,
      ClientWebsite,
      Ticket,
    ]),
    ProjectsModule,
    MailModule,
    NotificationsModule,
    forwardRef(() => RecurringTasksModule),
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
