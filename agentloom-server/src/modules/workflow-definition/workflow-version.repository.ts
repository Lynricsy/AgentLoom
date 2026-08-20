/**
 * 工作流版本仓储：集中暴露版本表使用的租户数据库与显式事务入口。
 */
import { Inject, Injectable } from '@nestjs/common';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';

@Injectable()
export class WorkflowVersionRepository {
  constructor(@Inject(DRIZZLE) private readonly rootDb: DrizzleDB) {}

  get db(): DrizzleDB {
    return this.rootDb;
  }

  get tenantDb(): DrizzleDB {
    return getTenantDb(this.rootDb);
  }
}
