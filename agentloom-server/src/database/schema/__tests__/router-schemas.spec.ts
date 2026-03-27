import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { llmModelConfigs } from '../llm-model-configs.schema';
import { organizations } from '../organizations.schema';
import { providerHealthStatus } from '../provider-health-status.schema';
import { routerModels } from '../router-models.schema';
import { routingBenchmarks } from '../routing-benchmarks.schema';
import { routingDecisions } from '../routing-decisions.schema';

function describeForeignKeys(
  table:
    | typeof routerModels
    | typeof routingBenchmarks
    | typeof providerHealthStatus,
) {
  return getTableConfig(table).foreignKeys.map((foreignKey) => {
    const reference = foreignKey.reference();

    return {
      columns: reference.columns.map((column) => column.name),
      foreignColumns: reference.foreignColumns.map((column) => column.name),
      foreignTable: getTableConfig(reference.foreignTable).name,
      onDelete: foreignKey.onDelete,
    };
  });
}

describe('smart routing schemas', () => {
  it('defines router_models with tenant/model foreign keys and unique tenant-model index', () => {
    const columns = getTableColumns(routerModels);
    const tableConfig = getTableConfig(routerModels);

    expect(tableConfig.name).toBe('router_models');
    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        'id',
        'tenantId',
        'modelId',
        'providerName',
        'routingMeta',
        'eloRating',
        'totalMatches',
        'isActive',
        'occVersion',
        'updatedAt',
        'createdAt',
      ]),
    );

    expect(tableConfig.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        'uq_router_models_tenant_model',
        'idx_router_models_tenant_id',
        'idx_router_models_provider_name',
        'idx_router_models_is_active',
      ]),
    );
    expect(tableConfig.policies).toHaveLength(4);

    expect(describeForeignKeys(routerModels)).toEqual(
      expect.arrayContaining([
        {
          columns: ['tenant_id'],
          foreignColumns: ['tenant_id'],
          foreignTable: getTableConfig(organizations).name,
          onDelete: 'cascade',
        },
        {
          columns: ['model_id'],
          foreignColumns: ['id'],
          foreignTable: getTableConfig(llmModelConfigs).name,
          onDelete: 'cascade',
        },
      ]),
    );
  });

  it('defines routing_benchmarks with task category index, router_models foreign key, and join-tenant policies', () => {
    const columns = getTableColumns(routingBenchmarks);
    const tableConfig = getTableConfig(routingBenchmarks);

    expect(tableConfig.name).toBe('routing_benchmarks');
    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        'id',
        'taskCategory',
        'queryText',
        'queryEmbeddingId',
        'modelId',
        'performanceScore',
        'tokenCount',
        'latencyMs',
        'mlpWeights',
        'createdAt',
      ]),
    );

    expect(tableConfig.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        'idx_routing_benchmarks_task_category',
        'idx_routing_benchmarks_model_id',
        'idx_routing_benchmarks_query_embedding_id',
      ]),
    );
    expect(tableConfig.policies).toHaveLength(4);

    expect(describeForeignKeys(routingBenchmarks)).toContainEqual({
      columns: ['model_id'],
      foreignColumns: ['id'],
      foreignTable: getTableConfig(routerModels).name,
      onDelete: 'cascade',
    });
  });

  it('defines provider_health_status and extends routing_decisions with nullable routerType', () => {
    const providerColumns = getTableColumns(providerHealthStatus);
    const providerTableConfig = getTableConfig(providerHealthStatus);
    const routingDecisionColumns = getTableColumns(routingDecisions);

    expect(providerTableConfig.name).toBe('provider_health_status');
    expect(Object.keys(providerColumns)).toEqual(
      expect.arrayContaining([
        'id',
        'tenantId',
        'providerName',
        'modelId',
        'status',
        'failureCount',
        'lastFailureAt',
        'lastSuccessAt',
        'circuitOpenedAt',
        'windowStartAt',
        'updatedAt',
      ]),
    );

    expect(
      providerTableConfig.indexes.map((index) => index.config.name),
    ).toEqual(
      expect.arrayContaining([
        'uq_provider_health_status_tenant_provider_model',
        'idx_provider_health_status_tenant_id',
        'idx_provider_health_status_provider_name',
        'idx_provider_health_status_status',
      ]),
    );
    expect(providerTableConfig.policies).toHaveLength(4);

    expect(describeForeignKeys(providerHealthStatus)).toEqual(
      expect.arrayContaining([
        {
          columns: ['tenant_id'],
          foreignColumns: ['tenant_id'],
          foreignTable: getTableConfig(organizations).name,
          onDelete: 'cascade',
        },
        {
          columns: ['model_id'],
          foreignColumns: ['id'],
          foreignTable: getTableConfig(routerModels).name,
          onDelete: 'cascade',
        },
      ]),
    );

    expect(routingDecisionColumns.routerType).toBeDefined();
    expect(routingDecisionColumns.routerType.getSQLType()).toBe('varchar(30)');
    expect(routingDecisionColumns.routerType.notNull).toBe(false);
  });
});
