import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Read-only requests (GET/HEAD) are never rate-limited — only state-changing
// requests are, and the sensitive ones (OTP, upload, publish...) already have
// their own stricter per-route @Throttle() limits.
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    if (req.method === 'GET' || req.method === 'HEAD') return true;
    return super.shouldSkip(context);
  }
}
