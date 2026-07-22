import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { User } from './users/entities/user.entity';
import { APP_GUARD } from '@nestjs/core';
import { RolesGuard } from './common/guards/roles.guard';
import { AuthGuard } from './common/guards/auth.guard';
import { MailModule } from './mail/mail.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OtpModule } from './otp/otp.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD as APP_GUARD_2 } from '@nestjs/core';
import { TasksModule } from './tasks/tasks.module';

import { ProjectsModule } from './projects/projects.module';
import { InvoicesModule } from './invoices/invoices.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ChatsModule } from './chats/chats.module';
import { TicketsModule } from './tickets/tickets.module';
import { FilesModule } from './files/files.module';
import { ProfilesModule } from './profiles/profiles.module';
import { RolesModule } from './roles/roles.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { ClientPortalModule } from './client-portal/client-portal.module';
import { CompanyModule } from './company/company.module';
import { PartnersModule } from './partners/partners.module';
import { KookModule } from './kook/kook.module';

import { join } from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 10,
    }]),
    TypeOrmModule.forFeature([User]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get('DB_PORT', 3306),
        username: configService.get('DB_USERNAME', 'root'),
        password: configService.get('DB_PASSWORD', ''),
        database: configService.get('DB_NAME', 'hipster'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        autoLoadEntities: true,
        synchronize: configService.get('DB_SYNCHRONIZE', 'false') === 'true',
        keepConnectionAlive: true,
        extra: {
          connectionLimit: 10,
          enableKeepAlive: true,
          keepAliveInitialDelay: 10000,
          waitForConnections: true,
          queueLimit: 0,
        },
      }),
    }),
    UsersModule,
    AuthModule,
    MailModule,
    OtpModule,
    TasksModule,
    ProjectsModule,
    InvoicesModule,
    NotificationsModule,
    ChatsModule,
    TicketsModule,
    FilesModule,
    ProfilesModule,
    RolesModule,
    CompanyModule,
    MaintenanceModule,
    ClientPortalModule,
    PartnersModule,
    KookModule,
  ],

  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD_2,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
