import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { User } from 'src/users/entities/user.entity';
import { ClientProfile } from 'src/profiles/entities/client-profile.entity';
import { Project } from 'src/projects/entities/project.entity';
import { Invoice } from 'src/invoices/entities/invoice.entity';
import { ConfigModule } from '@nestjs/config';
import { StripeService } from './stripe.service';
import { AiSubscriptionProfile } from 'src/profiles/entities/ai-subscription-profile.entity';
import { AiSubscription } from 'src/subscriptions/entities/ai-subscription.entity';
import { AiCredit } from 'src/profiles/entities/ai-credit.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      Payment,
      User,
      ClientProfile,
      Project,
      Invoice,
      AiSubscriptionProfile,
      AiSubscription,
      AiCredit,
    ]),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, StripeService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
