import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfilesService } from './profiles.service';
import { ProfilesController } from './profiles.controller';
import { ClientProfile } from './entities/client-profile.entity';
import { EmployeeProfile } from './entities/employee-profile.entity';
import { ClientWebsite } from './entities/client-website.entity';
import { User } from 'src/users/entities/user.entity';
import { AiUser } from 'src/ai/entities/ai-user.entity';
import { Task } from 'src/tasks/entities/task.entity';
import { MailModule } from 'src/mail/mail.module';
import { ClientWebsitesService } from './client-websites.service';
import { ClientWebsitesController } from './client-websites.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClientProfile,
      EmployeeProfile,
      ClientWebsite,
      User,
      AiUser,
      Task,
    ]),
    MailModule,
  ],
  controllers: [ProfilesController, ClientWebsitesController],
  providers: [ProfilesService, ClientWebsitesService],
  exports: [ProfilesService, ClientWebsitesService],
})
export class ProfilesModule {}
