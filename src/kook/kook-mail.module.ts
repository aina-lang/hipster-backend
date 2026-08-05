import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KookMailService } from './services/kook-mail.service';

@Module({
  imports: [ConfigModule],
  providers: [KookMailService],
  exports: [KookMailService],
})
export class KookMailModule {}
