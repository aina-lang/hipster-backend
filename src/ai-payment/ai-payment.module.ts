import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiPaymentService } from './ai-payment.service';
import { AiPaymentController } from './ai-payment.controller';
import { AiUser } from '../ai/entities/ai-user.entity';
import { AiSubscriptionProfile } from '../profiles/entities/ai-subscription-profile.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AiUser, AiSubscriptionProfile])],
  controllers: [AiPaymentController],
  providers: [AiPaymentService],
})
export class AiPaymentModule {}
