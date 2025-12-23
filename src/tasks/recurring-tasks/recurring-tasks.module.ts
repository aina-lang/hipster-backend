import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecurringTasksService } from './recurring-tasks.service';
import { RecurringTasksController } from './recurring-tasks.controller';
import { RecurringTask } from './entities/recurring-task.entity';
import { Task } from 'src/tasks/entities/task.entity';
import { Project } from 'src/projects/entities/project.entity';
import { User } from 'src/users/entities/user.entity';
import { TasksModule } from 'src/tasks/tasks.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RecurringTask, Task, Project, User]),
    forwardRef(() => TasksModule),
  ],
  controllers: [RecurringTasksController],
  providers: [RecurringTasksService],
})
export class RecurringTasksModule {}
