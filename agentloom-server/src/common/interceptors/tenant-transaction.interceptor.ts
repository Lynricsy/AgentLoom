import { AsyncLocalStorage } from 'node:async_hooks';
import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';

/**
 * 存储当前请求的租户事务上下文。
 * 在 TenantTransactionInterceptor 内部，tx 被存入 AsyncLocalStorage，
 * 下游通过 getTenantDb() 获取该 tx 而非原始 db 连接，
 * 确保 RLS 策略能在正确的事务上下文中执行。
 */
export const transactionStorage = new AsyncLocalStorage<DrizzleDB>();

@Injectable()
export class TenantTransactionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantTransactionInterceptor.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const tenantId: string | undefined = request.user?.tenantId;

    if (!tenantId) {
      return next.handle();
    }

    return new Observable((subscriber) => {
      this.db
        .transaction(async (tx) => {
          // 设置 PostgreSQL 角色以激活 RLS 策略
          await tx.execute(sql`SET LOCAL ROLE authenticated`);
          await tx.execute(
            sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`,
          );

          return await new Promise<unknown>((resolve, reject) => {
            let result: unknown;
            // tx 的运行时接口与 DrizzleDB 兼容（共享 PgDatabase 基类），
            // 类型断言安全：query/insert/update/delete/execute 方法完全一致
            transactionStorage.run(tx as unknown as DrizzleDB, () => {
              next.handle().subscribe({
                next: (val) => {
                  result = val;
                },
                error: (err) => reject(err),
                complete: () => resolve(result),
              });
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
