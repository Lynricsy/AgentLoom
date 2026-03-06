import 'reflect-metadata';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { CurrentTenant } from '../current-tenant.decorator';

class TestController {
  getCurrentTenant(_tenantId: string) {
    return undefined;
  }
}

CurrentTenant()(TestController.prototype, 'getCurrentTenant', 0);

function createExecutionContext(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  };
}

function getDecoratorFactory() {
  const metadata = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    TestController,
    'getCurrentTenant',
  ) as Record<string, { factory: (data: unknown, ctx: unknown) => unknown; data: unknown }>;

  return Object.values(metadata)[0];
}

describe('CurrentTenant decorator', () => {
  it('returns tenantId from request.user', () => {
    const request = {
      user: {
        tenantId: '11111111-1111-4111-8111-111111111111',
      },
    };
    const metadata = getDecoratorFactory();

    const result = metadata.factory(metadata.data, createExecutionContext(request));

    expect(result).toBe('11111111-1111-4111-8111-111111111111');
  });
});
