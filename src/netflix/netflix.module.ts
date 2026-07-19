import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NetflixUser } from './entities/netflix-user.entity';
import { NetflixOtp } from './entities/netflix-otp.entity';
import { NetflixAuthController } from './netflix-auth.controller';
import { NetflixAuthService } from './netflix-auth.service';
import { NetflixOtpService } from './netflix-otp.service';
import { NetflixJwtStrategy } from './strategies/netflix-jwt.strategy';

/**
 * 🎬 MODULE NETFLIX (isolé)
 * Aucune dépendance vers users/auth/profiles/mail/otp des autres apps.
 * Ses propres tables : netflix_users, netflix_otps.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([NetflixUser, NetflixOtp]),
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
  controllers: [NetflixAuthController],
  providers: [NetflixAuthService, NetflixOtpService, NetflixJwtStrategy],
  exports: [NetflixAuthService, NetflixOtpService, TypeOrmModule],
})
export class NetflixModule {}
