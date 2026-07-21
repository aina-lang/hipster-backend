import { Module } from '@nestjs/common';
import { KookMailService } from './services/kook-mail.service';

@Module({
  providers: [KookMailService],
  exports: [KookMailService],
})
export class KookMailModule {}
