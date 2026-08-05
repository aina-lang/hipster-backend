import { Module, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { KookUser } from './entities/kook-user.entity';
import { KookOtp } from './entities/kook-otp.entity';
import { Recipe } from './entities/recipe.entity';
import { KookComment } from './entities/kook-comment.entity';
import { KookNotification } from './entities/kook-notification.entity';
import { KookLike } from './entities/kook-like.entity';
import { KookCommentLike } from './entities/kook-comment-like.entity';
import { RecipeCategory } from './entities/recipe-category.entity';
import { Bookmark } from './entities/bookmark.entity';
import { Follow } from './entities/follow.entity';
import { KookAuthController } from './kook-auth.controller';
import { KookAuthService } from './kook-auth.service';
import { KookOtpService } from './kook-otp.service';
import { KookJwtStrategy } from './strategies/kook-jwt.strategy';
import { KookRecipesController } from './kook-recipes.controller';
import { KookRecipesService } from './kook-recipes.service';
import { KookUploadController } from './kook-upload.controller';
import { KookTelegramService } from './services/kook-telegram.service';
import { KookNsfwService } from './services/kook-nsfw.service';
import { KookAccountController } from './kook-account.controller';
import { KookAccountService } from './kook-account.service';
import { KookCommentController } from './kook-comment.controller';
import { KookCommentService } from './kook-comment.service';
import { KookNotificationController } from './kook-notification.controller';
import { KookNotificationService } from './kook-notification.service';
import { KookNotificationGateway } from './gateways/kook-notification.gateway';
import { KookCategoriesController } from './kook-categories.controller';
import { KookCategoriesService } from './kook-categories.service';
import { KookBookmarksController } from './kook-bookmarks.controller';
import { KookBookmarksService } from './kook-bookmarks.service';
import { KookFollowsController } from './kook-follows.controller';
import { KookFollowsService } from './kook-follows.service';
import { KookMailModule } from './kook-mail.module';

@Module({
  imports: [
    KookMailModule,
    TypeOrmModule.forFeature([KookUser, KookOtp, Recipe, KookComment, KookNotification, KookLike, KookCommentLike, RecipeCategory, Bookmark, Follow]),
    MulterModule.register({ storage: memoryStorage() }),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('KOOK_JWT_SECRET', 'kook-jwt-secret-change-in-production'),
        signOptions: { expiresIn: '4h' },
      }),
    }),
  ],
  controllers: [
    KookAuthController,
    KookRecipesController,
    KookUploadController,
    KookAccountController,
    KookCommentController,
    KookNotificationController,
    KookCategoriesController,
    KookBookmarksController,
    KookFollowsController,
  ],
  providers: [
    KookAuthService,
    KookOtpService,
    KookJwtStrategy,
    KookRecipesService,
    KookTelegramService,
    KookNsfwService,
    KookAccountService,
    KookCommentService,
    KookNotificationService,
    KookNotificationGateway,
    KookCategoriesService,
    KookBookmarksService,
    KookFollowsService,
  ],
  exports: [
    KookAuthService,
    KookOtpService,
    KookRecipesService,
    KookTelegramService,
    KookAccountService,
    KookCommentService,
    KookNotificationService,
    TypeOrmModule,
  ],
})
export class KookModule {}
