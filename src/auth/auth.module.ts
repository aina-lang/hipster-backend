import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { OtpModule } from 'src/otp/otp.module';
import { MailModule } from 'src/mail/mail.module';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { AiSubscriptionProfile } from 'src/profiles/entities/ai-subscription-profile.entity';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshStrategy } from './strategies/refresh.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, ClientProfile, AiSubscriptionProfile]),
    PassportModule,
    JwtModule.register({
      global: true,
      secret: 'MON KEY', // TODO: Use environment variable
      signOptions: { expiresIn: '4h' },
    }),
    OtpModule,
    MailModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    RefreshStrategy,
  ],
  exports: [AuthService],
})
export class AuthModule {}
