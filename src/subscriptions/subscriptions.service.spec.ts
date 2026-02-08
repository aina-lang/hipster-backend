import { SubscriptionsService } from './subscriptions.service';
import { AiPaymentService } from '../ai-payment/ai-payment.service';
import { Repository } from 'typeorm';
import { AiUser } from '../ai/entities/ai-user.entity';
import { AiSubscriptionProfile, PlanType, SubscriptionStatus } from '../profiles/entities/ai-subscription-profile.entity';
import { AiSubscription } from './entities/ai-subscription.entity';

function mockRepo(partial: Partial<Repository<any>> = {}): Repository<any> {
  return partial as Repository<any>;
}

describe('SubscriptionsService.getPlansForUser', () => {
  const mockPlans = [
    { id: 'curieux' },
    { id: 'atelier' },
  ];

  const aiPaymentService = ({
    getPlans: jest.fn().mockResolvedValue(mockPlans),
  } as unknown) as AiPaymentService;

  it('returns full plans for new user (no profile)', async () => {
    const svc = new SubscriptionsService(
      {} as any,
      aiPaymentService,
      mockRepo(),
      mockRepo({ findOne: jest.fn().mockResolvedValue(undefined) }),
      mockRepo(),
      mockRepo(),
    );

    const plans = await svc.getPlansForUser(1);
    expect(plans).toEqual(mockPlans);
  });

  it('hides curieux when curieux already used', async () => {
    const profile = { id: 10 } as AiSubscriptionProfile;
    const sub = { planName: 'curieux', startDate: new Date(), endDate: new Date(), status: 'expired' } as AiSubscription;

    const svc = new SubscriptionsService(
      {} as any,
      aiPaymentService,
      mockRepo(),
      mockRepo({ findOne: jest.fn().mockResolvedValue(profile) }),
      mockRepo(),
      mockRepo({ find: jest.fn().mockResolvedValue([sub]) }),
    );

    const plans = await svc.getPlansForUser(1);
    expect(plans.find((p: any) => p.id === 'curieux')).toBeUndefined();
  });

  it('hides curieux when active paid plan present', async () => {
    const profile = { id: 11, planType: PlanType.ATELIER, subscriptionStatus: SubscriptionStatus.ACTIVE } as AiSubscriptionProfile;

    const svc = new SubscriptionsService(
      {} as any,
      aiPaymentService,
      mockRepo(),
      mockRepo({ findOne: jest.fn().mockResolvedValue(profile) }),
      mockRepo(),
      mockRepo({ find: jest.fn().mockResolvedValue([]) }),
    );

    const plans = await svc.getPlansForUser(2);
    expect(plans.find((p: any) => p.id === 'curieux')).toBeUndefined();
  });

  it('shows curieux when paid >30d expired and never used curieux', async () => {
    const profile = { id: 12, planType: PlanType.ATELIER, subscriptionStatus: SubscriptionStatus.CANCELED } as AiSubscriptionProfile;
    const start = new Date();
    start.setDate(start.getDate() - 40);
    const end = new Date();
    end.setDate(end.getDate() - 10);
    const sub = { planName: 'atelier', startDate: start, endDate: end, status: 'expired' } as AiSubscription;

    const svc = new SubscriptionsService(
      {} as any,
      aiPaymentService,
      mockRepo(),
      mockRepo({ findOne: jest.fn().mockResolvedValue(profile) }),
      mockRepo(),
      mockRepo({ find: jest.fn().mockResolvedValue([sub]) }),
    );

    const plans = await svc.getPlansForUser(3);
    expect(plans.find((p: any) => p.id === 'curieux')).toBeDefined();
  });
});
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SubscriptionsService],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
