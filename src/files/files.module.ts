import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from 'src/projects/entities/project.entity';
import { User } from 'src/users/entities/user.entity';
import { Task } from 'src/tasks/entities/task.entity';
import { Ticket } from 'src/tickets/entities/ticket.entity';
import { File } from './entities/file.entity';

@Module({
  controllers: [FilesController],
  imports: [TypeOrmModule.forFeature([Project, User, Task, Ticket, File])],
  providers: [FilesService],
})
export class FilesModule {}
