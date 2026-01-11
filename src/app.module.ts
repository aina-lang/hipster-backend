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
import { TasksModule } from './tasks/tasks.module';

import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { PaymentsModule } from './payments/payments.module';
import { ProjectsModule } from './projects/projects.module';
import { InvoicesModule } from './invoices/invoices.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ChatsModule } from './chats/chats.module';
import { TicketsModule } from './tickets/tickets.module';
import { FilesModule } from './files/files.module';
import { ProfilesModule } from './profiles/profiles.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { PermissionsModule } from './permissions/permissions.module';
import { RolesModule } from './roles/roles.module';
import { MaintenanceModule } from './maintenance/maintenance.module';

import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { ReferralModule } from './referral/referral.module';
import { CompanyModule } from './company/company.module';
import { AiAuthModule } from './ai-auth/ai-auth.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forFeature([User]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: '51.178.50.63',
        port: 3306,
        username: 'hipsteruser',
        password: 'MotDePasseFort',
        database: 'hipsterdb',
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        autoLoadEntities: true,
        synchronize: true,
        keepConnectionAlive: true,
        extra: {
          connectionLimit: 10,
          enableKeepAlive: true,
          keepAliveInitialDelay: 0,
        },
      }),
    }),
    UsersModule,
    AuthModule,
    MailModule,
    OtpModule,
    TasksModule,

    SubscriptionsModule,
    PaymentsModule,
    ProjectsModule,
    InvoicesModule,
    NotificationsModule,
    ChatsModule,
    TicketsModule,
    FilesModule,
    ProfilesModule,
    CampaignsModule,
    PermissionsModule,
    RolesModule,
    LoyaltyModule,
    ReferralModule,
    CompanyModule,
    MaintenanceModule,
    AiAuthModule,
    AiModule,
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
  ],
})
export class AppModule {
  // constructor(private dataSource: DataSource) { }
}
