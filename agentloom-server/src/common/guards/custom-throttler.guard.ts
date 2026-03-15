import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(
    req: Record<string, any>,
  ): Promise<string> {
    if (req.authMethod === 'api_key' && req.user?.sub) {
      return `apikey:${req.user.sub}`;
    }

    if (req.user?.sub) {
      return `jwt:${req.user.sub}`;
    }

    return req.ip ?? 'unknown';
  }
}
