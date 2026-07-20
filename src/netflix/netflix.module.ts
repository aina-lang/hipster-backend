import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { NetflixUser } from './entities/netflix-user.entity';
import { NetflixOtp } from './entities/netflix-otp.entity';
import { NetflixVideo } from './entities/netflix-video.entity';
import { NetflixAccessCode } from './entities/netflix-access-code.entity';
import { NetflixAuthController } from './netflix-auth.controller';
import { NetflixAuthService } from './netflix-auth.service';
import { NetflixOtpService } from './netflix-otp.service';
import { NetflixJwtStrategy } from './strategies/netflix-jwt.strategy';
import { NetflixContentController } from './netflix-content.controller';
import { NetflixContentService } from './netflix-content.service';
import { NetflixTelegramService } from './netflix-telegram.service';

/**
 * 🎬 MODULE NETFLIX (isolé)
 * Aucune dépendance vers users/auth/profiles/mail/otp des autres apps.
 * Ses propres tables : netflix_users, netflix_otps, netflix_videos, netflix_access_codes.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([NetflixUser, NetflixOtp, NetflixVideo, NetflixAccessCode]),
    MulterModule.register({ dest: './uploads' }),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('NETFLIX_JWT_SECRET') || 'NETFLIX_DEFAULT_SECRET',
        signOptions: { expiresIn: '4h' },
      }),
    }),
  ],
  controllers: [NetflixAuthController, NetflixContentController],
  providers: [NetflixAuthService, NetflixOtpService, NetflixJwtStrategy, NetflixContentService, NetflixTelegramService],
  exports: [NetflixAuthService, NetflixOtpService, NetflixContentService, TypeOrmModule],
})
export class NetflixModule {}
