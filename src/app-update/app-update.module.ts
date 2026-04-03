import { Module } from '@nestjs/common';
import { AppUpdateController } from './app-update.controller';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [TelegramModule],
  controllers: [AppUpdateController],
  providers: [],
  exports: []
})
export class AppUpdateModule {}
