import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { KookUser } from './entities/kook-user.entity';
import { KookOtp } from './entities/kook-otp.entity';
import { Recipe } from './entities/recipe.entity';
import { KookAuthController } from './kook-auth.controller';
import { KookAuthService } from './kook-auth.service';
import { KookOtpService } from './kook-otp.service';
import { KookJwtStrategy } from './strategies/kook-jwt.strategy';
import { KookRecipesController } from './kook-recipes.controller';
import { KookRecipesService } from './kook-recipes.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([KookUser, KookOtp, Recipe]),
    MulterModule.register({ dest: './uploads' }),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('KOOK_JWT_SECRET') || 'KOOK_DEFAULT_SECRET',
        signOptions: { expiresIn: '4h' },
      }),
    }),
  ],
  controllers: [KookAuthController, KookRecipesController],
  providers: [KookAuthService, KookOtpService, KookJwtStrategy, KookRecipesService],
  exports: [KookAuthService, KookOtpService, KookRecipesService, TypeOrmModule],
})
export class KookModule {}
