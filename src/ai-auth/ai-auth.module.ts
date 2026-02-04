import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AiAuthService } from './ai-auth.service';
import { AiAuthController } from './ai-auth.controller';
import { AiUser } from 'src/ai/entities/ai-user.entity';
import { AiSubscriptionProfile } from 'src/profiles/entities/ai-subscription-profile.entity';
import { AiCredit } from 'src/profiles/entities/ai-credit.entity';
import { OtpModule } from 'src/otp/otp.module';
import { MailModule } from 'src/mail/mail.module';

import { AiJwtStrategy } from './strategies/ai-jwt.strategy';
import { AiRefreshStrategy } from './strategies/ai-refresh.strategy';
import { PassportModule } from '@nestjs/passport';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiUser, AiSubscriptionProfile, AiCredit]),
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'secretKey',
      signOptions: { expiresIn: '4h' },
    }),
    OtpModule,
    MailModule,
  ],
  controllers: [AiAuthController],
  providers: [AiAuthService, AiJwtStrategy, AiRefreshStrategy],
  exports: [AiAuthService, AiJwtStrategy, AiRefreshStrategy],
})
export class AiAuthModule {}
