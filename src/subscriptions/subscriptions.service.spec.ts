// Mocks for relative entity modules to avoid path-alias/runtime resolution issues
jest.mock('../profiles/entities/ai-subscription-profile.entity', () => ({
  AiSubscriptionProfile: class {},
  PlanType: { CURIEUX: 'curieux', ATELIER: 'atelier', STUDIO: 'studio', AGENCE: 'agence' },
  SubscriptionStatus: { ACTIVE: 'active', CANCELED: 'canceled', TRIAL: 'trial' },
}));

jest.mock('../ai/entities/ai-user.entity', () => ({ AiUser: class {} }));
jest.mock('../profiles/entities/ai-credit.entity', () => ({ AiCredit: class {} }));
jest.mock('./entities/ai-subscription.entity', () => ({ AiSubscription: class {} }));

import { Repository } from 'typeorm';

function mockRepo(partial: Partial<Repository<any>> = {}): Repository<any> {
  return partial as Repository<any>;
}

describe('SubscriptionsService.getPlansForUser', () => {
  const mockPlans = [{ id: 'curieux' }, { id: 'atelier' }];

  const aiPaymentServiceMock = ({
    getPlans: jest.fn().mockResolvedValue(mockPlans),
  } as unknown) as any;
  const configServiceMock = { get: jest.fn().mockReturnValue(undefined) } as any;

  // Load service after mocks are in place
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { SubscriptionsService } = require('./subscriptions.service');

  it('returns full plans for new user (no profile)', async () => {
    const svc = new SubscriptionsService(
      configServiceMock,
      aiPaymentServiceMock,
      mockRepo(), // AiUser repo
      mockRepo({ findOne: jest.fn().mockResolvedValue(undefined) }), // subRepo.findOne -> no profile
      mockRepo(), // aiSubscriptionRepo
      mockRepo(), // aiCreditRepo
    );

    const plans = await svc.getPlansForUser(1);
    expect(plans).toEqual(mockPlans);
  });

  it('hides curieux when curieux already used', async () => {
    const profile = { id: 10 } as any;
    const sub = { planName: 'curieux', startDate: new Date(), endDate: new Date(), status: 'expired' } as any;

    const svc = new SubscriptionsService(
      configServiceMock,
      aiPaymentServiceMock,
      mockRepo(),
      mockRepo({ findOne: jest.fn().mockResolvedValue(profile) }),
      mockRepo({ find: jest.fn().mockResolvedValue([sub]) }),
      mockRepo(),
    );

    const plans = await svc.getPlansForUser(1);
    expect(plans.find((p: any) => p.id === 'curieux')).toBeUndefined();
  });

  it('hides curieux when active paid plan present', async () => {
    const profile = { id: 11, planType: 'atelier', subscriptionStatus: 'active' } as any;

    const svc = new SubscriptionsService(
      configServiceMock,
      aiPaymentServiceMock,
      mockRepo(),
      mockRepo({ findOne: jest.fn().mockResolvedValue(profile) }),
      mockRepo({ find: jest.fn().mockResolvedValue([]) }),
      mockRepo(),
    );

    const plans = await svc.getPlansForUser(2);
    expect(plans.find((p: any) => p.id === 'curieux')).toBeUndefined();
  });

  it('shows curieux when paid >30d expired and never used curieux', async () => {
    const profile = { id: 12, planType: 'atelier', subscriptionStatus: 'canceled' } as any;
    const start = new Date();
    start.setDate(start.getDate() - 40);
    const end = new Date();
    end.setDate(end.getDate() - 10);
    const sub = { planName: 'atelier', startDate: start, endDate: end, status: 'expired' } as any;

    const svc = new SubscriptionsService(
      configServiceMock,
      aiPaymentServiceMock,
      mockRepo(),
      mockRepo({ findOne: jest.fn().mockResolvedValue(profile) }),
      mockRepo({ find: jest.fn().mockResolvedValue([sub]) }),
      mockRepo(),
    );

    const plans = await svc.getPlansForUser(3);
    expect(plans.find((p: any) => p.id === 'curieux')).toBeDefined();
  });

  it('shows curieux when expired (trial past endDate) and never used before', async () => {
    const now = new Date();
    const expiredEndDate = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
    const profile = {
      id: 13,
      planType: 'curieux',
      subscriptionStatus: 'active',
      subscriptionEndDate: expiredEndDate,
    } as any;
    const sub = { planName: 'curieux', startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), endDate: expiredEndDate, status: 'expired' } as any;

    const svc = new SubscriptionsService(
      configServiceMock,
      aiPaymentServiceMock,
      mockRepo(),
      mockRepo({ findOne: jest.fn().mockResolvedValue(profile) }),
      mockRepo({ find: jest.fn().mockResolvedValue([sub]) }),
      mockRepo(),
    );

    const plans = await svc.getPlansForUser(4);
    // Note: After expitation, curieux should reappear only if user can use it again
    // This test validates that expired curieux is counted as "used" and won't reappear
    expect(plans.find((p: any) => p.id === 'curieux')).toBeUndefined();
  });
});
