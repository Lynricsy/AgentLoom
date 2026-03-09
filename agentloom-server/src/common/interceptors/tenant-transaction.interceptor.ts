import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import { runInTenantTransaction } from './tenant-transaction.context';

export { transactionStorage } from './tenant-transaction.context';

/**
 * 存储当前请求的租户事务上下文。
 * 在 TenantTransactionInterceptor 内部，tx 被存入 AsyncLocalStorage，
 * 下游通过 getTenantDb() 获取该 tx 而非原始 db 连接，
 * 确保 RLS 策略能在正确的事务上下文中执行。
 */
@Injectable()
export class TenantTransactionInterceptor implements NestInterceptor {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const tenantId: string | undefined = request.user?.tenantId;

    if (!tenantId) {
      return next.handle();
    }

    return new Observable((subscriber) => {
      runInTenantTransaction(this.db, tenantId, async () => {
        return await new Promise<unknown>((resolve, reject) => {
          let result: unknown;

          next.handle().subscribe({
            next: (val) => {
              result = val;
            },
            error: (err) => reject(err),
            complete: () => resolve(result),
          });
        });
      })
        .then((responseValue) => {
          // 事务已提交后才发送响应，避免竞态条件
          subscriber.next(responseValue);
          subscriber.complete();
        })
        .catch((err: unknown) => {
          if (!subscriber.closed) {
            subscriber.error(err);
          }
        });
    });
  }
}
