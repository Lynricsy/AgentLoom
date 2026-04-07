import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  and,
  eq,
  exists,
  inArray,
  sql,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm';

import { getTenantDb } from '../../common/providers/tenant-aware-db.provider';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import {
  resourceSourceRecords,
  type NewResourceSourceRecord,
  type ResourceSourceKind,
  type ResourceSourceResourceType,
  type ResourceSourceShareType,
} from '../../database/schema';

export interface ImportedResourceSourceRecordInput {
  resourceType: ResourceSourceResourceType;
  resourceId: string;
  sourceShareType: ResourceSourceShareType;
  sourceShareId?: string | null;
  sourceShareToken?: string | null;
  sourceResourceType?: ResourceSourceResourceType | null;
  sourceResourceId?: string | null;
  sourceResourceTitle?: string | null;
}

@Injectable()
export class ResourceSourceService {
  private readonly logger = new Logger(ResourceSourceService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  private get tenantDb(): DrizzleDB {
    return getTenantDb(this.db);
  }

  buildShareImportedExistsCondition(params: {
    resourceType: ResourceSourceResourceType;
    resourceIdColumn: SQLWrapper;
  }): SQL<unknown> {
    return exists(
      this.tenantDb
        .select({ id: resourceSourceRecords.id })
        .from(resourceSourceRecords)
        .where(
          and(
            eq(resourceSourceRecords.resourceType, params.resourceType),
            eq(resourceSourceRecords.resourceId, params.resourceIdColumn),
            eq(resourceSourceRecords.currentKind, 'share_imported'),
          ),
        ),
    );
  }

  async mapCurrentKinds(
    resourceType: ResourceSourceResourceType,
    resourceIds: string[],
  ): Promise<Map<string, ResourceSourceKind>> {
    if (resourceIds.length === 0) {
      return new Map();
    }

    const rows = await this.tenantDb
      .select({
        resourceId: resourceSourceRecords.resourceId,
        currentKind: resourceSourceRecords.currentKind,
      })
      .from(resourceSourceRecords)
      .where(
        and(
          eq(resourceSourceRecords.resourceType, resourceType),
          inArray(resourceSourceRecords.resourceId, resourceIds),
        ),
      );

    return new Map(rows.map((row) => [row.resourceId, row.currentKind]));
  }

  async recordImportedResources(
    tenantId: string,
    userId: string,
    items: ImportedResourceSourceRecordInput[],
  ): Promise<void> {
    if (items.length === 0) {
      return;
    }

    const values: NewResourceSourceRecord[] = items.map((item) => ({
      tenantId,
      resourceType: item.resourceType,
      resourceId: item.resourceId,
      originKind: 'share_imported',
      currentKind: 'share_imported',
      sourceShareType: item.sourceShareType,
      sourceShareId: item.sourceShareId ?? null,
      sourceShareToken: item.sourceShareToken ?? null,
      sourceResourceType: item.sourceResourceType ?? null,
      sourceResourceId: item.sourceResourceId ?? null,
      sourceResourceTitle: item.sourceResourceTitle ?? null,
      createdBy: userId,
    }));

    await this.tenantDb
      .insert(resourceSourceRecords)
      .values(values)
      .onConflictDoUpdate({
        target: [
          resourceSourceRecords.tenantId,
          resourceSourceRecords.resourceType,
          resourceSourceRecords.resourceId,
        ],
        set: {
          originKind: sql<ResourceSourceKind>`excluded.origin_kind`,
          currentKind: sql<ResourceSourceKind>`excluded.current_kind`,
          sourceShareType: sql<ResourceSourceShareType | null>`excluded.source_share_type`,
          sourceShareId: sql<string | null>`excluded.source_share_id`,
          sourceShareToken: sql<string | null>`excluded.source_share_token`,
          sourceResourceType: sql<ResourceSourceResourceType | null>`excluded.source_resource_type`,
          sourceResourceId: sql<string | null>`excluded.source_resource_id`,
          sourceResourceTitle: sql<
            string | null
          >`excluded.source_resource_title`,
          updatedAt: new Date(),
        },
      });

    this.logger.log(
      `已记录分享导入资源来源: tenant=${tenantId}, count=${items.length}`,
    );
  }

  async convertToManual(
    tenantId: string,
    resourceType: ResourceSourceResourceType,
    resourceId: string,
  ): Promise<{
    resourceType: ResourceSourceResourceType;
    resourceId: string;
    currentKind: ResourceSourceKind;
  }> {
    const [updated] = await this.tenantDb
      .update(resourceSourceRecords)
      .set({
        currentKind: 'manual',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(resourceSourceRecords.tenantId, tenantId),
          eq(resourceSourceRecords.resourceType, resourceType),
          eq(resourceSourceRecords.resourceId, resourceId),
        ),
      )
      .returning({
        resourceId: resourceSourceRecords.resourceId,
        resourceType: resourceSourceRecords.resourceType,
        currentKind: resourceSourceRecords.currentKind,
      });

    return (
      updated ?? {
        resourceId,
        resourceType,
        currentKind: 'manual',
      }
    );
  }
}
