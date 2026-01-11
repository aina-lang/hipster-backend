import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiUsageLog } from './entities/ai-usage-log.entity';
import { AiUser } from './entities/ai-user.entity';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([AiUsageLog, AiUser])],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {
  constructor() {
    console.log('--- AiModule Loaded ---');
  }
}
