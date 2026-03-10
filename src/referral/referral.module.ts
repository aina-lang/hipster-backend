import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferralService } from './referral.service';
import { ReferralController } from './referral.controller';
import { AiUser } from 'src/ai/entities/ai-user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AiUser])],
  controllers: [ReferralController],
  providers: [ReferralService],
})
export class ReferralModule {}
