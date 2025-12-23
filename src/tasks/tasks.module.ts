import { Module, forwardRef } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from './entities/task.entity';
import { ProjectsModule } from 'src/projects/projects.module';
import { User } from 'src/users/entities/user.entity';
import { Project } from 'src/projects/entities/project.entity';
import { EmployeeProfile } from 'src/profiles/entities/employee-profile.entity';

import { MailModule } from 'src/mail/mail.module';
import { RecurringTasksModule } from './recurring-tasks/recurring-tasks.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task, User, Project, EmployeeProfile]),
    ProjectsModule,
    MailModule,
    forwardRef(() => RecurringTasksModule),
  ],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule { }
