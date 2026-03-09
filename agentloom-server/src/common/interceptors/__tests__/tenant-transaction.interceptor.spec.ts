import { type CallHandler, type ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { Observable, lastValueFrom, of } from 'rxjs';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DRIZZLE } from '../../../database/database.module';
import {
  TenantTransactionInterceptor,
  transactionStorage,
} from '../tenant-transaction.interceptor';

type MockRequest = {
  user?: {
    tenantId?: string;
  };
};

type MockTx = {
  execute: ReturnType<typeof vi.fn>;
};

type MockDb = {
  transaction: ReturnType<typeof vi.fn>;
};

function createMockExecutionContext(request: MockRequest): ExecutionContext {
  const context = {
    switchToHttp: vi.fn().mockReturnValue({
      getRequest: vi.fn().mockReturnValue(request),
    }),
    switchToRpc: vi.fn(),
    switchToWs: vi.fn(),
    getArgByIndex: vi.fn(),
    getArgs: vi.fn().mockReturnValue([request]),
    getType: vi.fn().mockReturnValue('http'),
    getClass: vi.fn(),
    getHandler: vi.fn(),
  };

  return context as unknown as ExecutionContext;
}

function createMockCallHandler(
  handleImpl: () => Observable<unknown>,
): CallHandler {
  return {
    handle: vi.fn(handleImpl),
  };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('TenantTransactionInterceptor', () => {
  let interceptor: TenantTransactionInterceptor;
  let mockDb: MockDb;
  let mockTx: MockTx;

  beforeEach(async () => {
    mockTx = {
      execute: vi.fn().mockResolvedValue(undefined),
    };

    mockDb = {
      transaction: vi.fn(async (callback: (tx: MockTx) => Promise<unknown>) =>
        callback(mockTx),
      ),
    };

    const module = await Test.createTestingModule({
      providers: [
        TenantTransactionInterceptor,
        {
          provide: DRIZZLE,
          useValue: mockDb,
        },
      ],
    }).compile();

    interceptor = module.get(TenantTransactionInterceptor);
  });

  it('request.user 没有 tenantId 时直接透传给下游处理器', async () => {
    const context = createMockExecutionContext({ user: {} });
    const next = createMockCallHandler(() => of('passthrough-result'));

    const result = await lastValueFrom(interceptor.intercept(context, next));

    expect(result).toBe('passthrough-result');
    expect(next.handle).toHaveBeenCalledTimes(1);
    expect(mockDb.transaction).not.toHaveBeenCalled();
    expect(mockTx.execute).not.toHaveBeenCalled();
  });

  it('tenantId 存在时开启事务、设置角色与租户上下文，并返回处理结果', async () => {
    const tenantId = 'test-tenant-id';
    const context = createMockExecutionContext({
      user: { tenantId },
    });
    let observedStore: unknown;
    const next = createMockCallHandler(() => {
      observedStore = transactionStorage.getStore();
      return of('transaction-result');
    });

    const result = await lastValueFrom(interceptor.intercept(context, next));

    expect(result).toBe('transaction-result');
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.execute).toHaveBeenCalledTimes(2);
    expect(mockTx.execute).toHaveBeenNthCalledWith(
      1,
      sql`SET LOCAL ROLE authenticated`,
    );
    expect(mockTx.execute).toHaveBeenNthCalledWith(
      2,
      sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`,
    );
    expect(next.handle).toHaveBeenCalledTimes(1);
    expect(observedStore).toBe(mockTx);
  });

  it('subscriber 已关闭时不会重复向外抛出事务中的错误', async () => {
    const context = createMockExecutionContext({
      user: { tenantId: 'test-tenant-id' },
    });
    const testError = new Error('closed-subscriber-error');
    const errorSpy = vi.fn();
    const next = createMockCallHandler(
      () =>
        new Observable((subscriber) => {
          queueMicrotask(() => subscriber.error(testError));
        }),
    );

    const subscription = interceptor.intercept(context, next).subscribe({
      error: errorSpy,
    });

    subscription.unsubscribe();
    await flushAsyncWork();

    expect(errorSpy).not.toHaveBeenCalled();
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
  });

  it('下游处理器抛错时保持原样向外传播', async () => {
    const context = createMockExecutionContext({
      user: { tenantId: 'test-tenant-id' },
    });
    const testError = new Error('handler-failed');
    const next = createMockCallHandler(
      () =>
        new Observable((subscriber) => {
          subscriber.error(testError);
        }),
    );

    await expect(
      lastValueFrom(interceptor.intercept(context, next)),
    ).rejects.toBe(testError);
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
  });
});
