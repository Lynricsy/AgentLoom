import 'reflect-metadata';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { CurrentUser } from '../current-user.decorator';

class TestController {
  getCurrentUser(_user: unknown) {
    return undefined;
  }

  getCurrentUserId(_userId: string) {
    return undefined;
  }
}

CurrentUser()(TestController.prototype, 'getCurrentUser', 0);
CurrentUser('sub')(TestController.prototype, 'getCurrentUserId', 0);

function createExecutionContext(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  };
}

function getDecoratorFactory(
  methodName: 'getCurrentUser' | 'getCurrentUserId',
) {
  const metadata = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    TestController,
    methodName,
  ) as Record<
    string,
    { factory: (data: unknown, ctx: unknown) => unknown; data: unknown }
  >;

  return Object.values(metadata)[0];
}

describe('CurrentUser decorator', () => {
  it('returns the full user payload when no field is requested', () => {
    const request = {
      user: {
        sub: 'user-1',
        email: 'user@example.com',
      },
    };
    const metadata = getDecoratorFactory('getCurrentUser');

    const result = metadata.factory(
      metadata.data,
      createExecutionContext(request),
    );

    expect(result).toEqual(request.user);
  });

  it('returns a specific user field when data is provided', () => {
    const request = {
      user: {
        sub: 'user-1',
        email: 'user@example.com',
      },
    };
    const metadata = getDecoratorFactory('getCurrentUserId');

    const result = metadata.factory(
      metadata.data,
      createExecutionContext(request),
    );

    expect(result).toBe('user-1');
  });
});
