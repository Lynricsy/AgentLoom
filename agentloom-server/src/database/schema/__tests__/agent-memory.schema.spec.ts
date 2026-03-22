import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  agentMemoryInstances as barrelAgentMemoryInstances,
  memoryEdges as barrelMemoryEdges,
  memoryGlossaryKeywords as barrelMemoryGlossaryKeywords,
  memoryNodes as barrelMemoryNodes,
  memoryPaths as barrelMemoryPaths,
  memoryReviewStatusEnum as barrelMemoryReviewStatusEnum,
  memoryVersions as barrelMemoryVersions,
  memoryInstanceStatusEnum as barrelMemoryInstanceStatusEnum,
} from '..';
import {
  agentMemoryInstances,
  memoryInstanceStatusEnum,
  type MemoryInstance,
  type MemoryInstanceConfig,
  type NewMemoryInstance,
} from '../agent-memory-instances.schema';
import {
  memoryEdges,
  type MemoryEdge,
  type NewMemoryEdge,
} from '../memory-edges.schema';
import {
  memoryGlossaryKeywords,
  type MemoryGlossaryKeyword,
  type NewMemoryGlossaryKeyword,
} from '../memory-glossary-keywords.schema';
import {
  memoryNodes,
  type MemoryNode,
  type MemoryNodeMetadata,
  type NewMemoryNode,
} from '../memory-nodes.schema';
import {
  memoryPaths,
  type MemoryPath,
  type NewMemoryPath,
} from '../memory-paths.schema';
import {
  memoryReviewStatusEnum,
  memoryVersions,
  type MemoryVersion,
  type NewMemoryVersion,
} from '../memory-versions.schema';

type MemoryInstanceConfigIsRecord =
  MemoryInstanceConfig extends Record<string, unknown> ? true : false;
type MemoryNodeMetadataIsRecord =
  MemoryNodeMetadata extends Record<string, unknown> ? true : false;
type DirectImportSmoke = [
  MemoryInstance,
  NewMemoryInstance,
  MemoryInstanceConfig,
  MemoryNode,
  NewMemoryNode,
  MemoryNodeMetadata,
  MemoryVersion,
  NewMemoryVersion,
  MemoryEdge,
  NewMemoryEdge,
  MemoryPath,
  NewMemoryPath,
  MemoryGlossaryKeyword,
  NewMemoryGlossaryKeyword,
];
type BarrelImportSmoke = [
  import('..').MemoryInstance,
  import('..').NewMemoryInstance,
  import('..').MemoryInstanceConfig,
  import('..').MemoryNode,
  import('..').NewMemoryNode,
  import('..').MemoryNodeMetadata,
  import('..').MemoryVersion,
  import('..').NewMemoryVersion,
  import('..').MemoryEdge,
  import('..').NewMemoryEdge,
  import('..').MemoryPath,
  import('..').NewMemoryPath,
  import('..').MemoryGlossaryKeyword,
  import('..').NewMemoryGlossaryKeyword,
];

type MemoryGraphTable =
  | typeof agentMemoryInstances
  | typeof memoryNodes
  | typeof memoryVersions
  | typeof memoryEdges
  | typeof memoryPaths
  | typeof memoryGlossaryKeywords;

function describeForeignKeys(table: MemoryGraphTable) {
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

describe('agent memory schemas', () => {
  it('exports all agent memory tables, enums, and types from direct files and schema barrel', () => {
    expect(barrelAgentMemoryInstances).toBe(agentMemoryInstances);
    expect(barrelMemoryNodes).toBe(memoryNodes);
    expect(barrelMemoryVersions).toBe(memoryVersions);
    expect(barrelMemoryEdges).toBe(memoryEdges);
    expect(barrelMemoryPaths).toBe(memoryPaths);
    expect(barrelMemoryGlossaryKeywords).toBe(memoryGlossaryKeywords);
    expect(barrelMemoryInstanceStatusEnum).toBe(memoryInstanceStatusEnum);
    expect(barrelMemoryReviewStatusEnum).toBe(memoryReviewStatusEnum);

    const directTypeImportSmoke: DirectImportSmoke | null = null;
    const barrelTypeImportSmoke: BarrelImportSmoke | null = null;
    const memoryInstanceConfigTypeSmoke: MemoryInstanceConfigIsRecord = true;
    const memoryNodeMetadataTypeSmoke: MemoryNodeMetadataIsRecord = true;

    expect(directTypeImportSmoke).toBeNull();
    expect(barrelTypeImportSmoke).toBeNull();
    expect(memoryInstanceConfigTypeSmoke).toBe(true);
    expect(memoryNodeMetadataTypeSmoke).toBe(true);
  });

  it('defines agent_memory_instances with tenant/OCC/default array columns and direct tenant RLS', () => {
    const columns = getTableColumns(agentMemoryInstances);
    const tableConfig = getTableConfig(agentMemoryInstances);

    expect(tableConfig.name).toBe('agent_memory_instances');
    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        'id',
        'tenantId',
        'name',
        'description',
        'config',
        'systemPromptOverride',
        'validDomains',
        'coreMemoryUris',
        'status',
        'occVersion',
        'createdBy',
        'createdAt',
        'updatedAt',
      ]),
    );

    expect(columns.id.hasDefault).toBe(true);
    expect(columns.tenantId.notNull).toBe(true);
    expect(columns.name.notNull).toBe(true);
    expect(columns.validDomains.getSQLType()).toBe('text[]');
    expect(columns.validDomains.hasDefault).toBe(true);
    expect(columns.coreMemoryUris.getSQLType()).toBe('text[]');
    expect(columns.coreMemoryUris.hasDefault).toBe(true);
    expect(columns.status.getSQLType()).toBe('memory_instance_status');
    expect(columns.status.hasDefault).toBe(true);
    expect(columns.occVersion.notNull).toBe(true);
    expect(columns.occVersion.hasDefault).toBe(true);
    expect(columns.createdAt.notNull).toBe(true);
    expect(columns.createdAt.hasDefault).toBe(true);
    expect(columns.updatedAt.notNull).toBe(true);
    expect(columns.updatedAt.hasDefault).toBe(true);

    expect(tableConfig.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        'idx_agent_memory_instances_tenant_id',
        'idx_agent_memory_instances_created_by',
        'idx_agent_memory_instances_status',
      ]),
    );
    expect(tableConfig.policies).toHaveLength(4);
  });

  it('defines memory_nodes with permanent instance anchor, tenant column, and cascading instance FK', () => {
    const columns = getTableColumns(memoryNodes);
    const tableConfig = getTableConfig(memoryNodes);

    expect(tableConfig.name).toBe('memory_nodes');
    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        'id',
        'instanceId',
        'tenantId',
        'contentType',
        'metadata',
        'disclosureLevel',
        'createdAt',
      ]),
    );

    expect(columns.id.hasDefault).toBe(true);
    expect(columns.instanceId.notNull).toBe(true);
    expect(columns.tenantId.notNull).toBe(true);
    expect(columns.contentType.getSQLType()).toBe('varchar(64)');
    expect(columns.contentType.hasDefault).toBe(true);
    expect(columns.disclosureLevel.hasDefault).toBe(true);
    expect(columns.createdAt.notNull).toBe(true);
    expect(columns.createdAt.hasDefault).toBe(true);

    expect(tableConfig.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        'idx_memory_nodes_instance_id',
        'idx_memory_nodes_tenant_id',
      ]),
    );
    expect(tableConfig.policies).toHaveLength(4);

    expect(describeForeignKeys(memoryNodes)).toContainEqual({
      columns: ['instance_id'],
      foreignColumns: ['id'],
      foreignTable: 'agent_memory_instances',
      onDelete: 'cascade',
    });
  });

  it('defines memory_versions with content snapshots, migration chain, review enum, and node/version foreign keys', () => {
    const columns = getTableColumns(memoryVersions);
    const tableConfig = getTableConfig(memoryVersions);

    expect(tableConfig.name).toBe('memory_versions');
    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        'id',
        'nodeId',
        'tenantId',
        'content',
        'version',
        'deprecated',
        'migratedTo',
        'reviewStatus',
        'patchSummary',
        'createdBy',
        'createdAt',
      ]),
    );

    expect(columns.id.hasDefault).toBe(true);
    expect(columns.nodeId.notNull).toBe(true);
    expect(columns.tenantId.notNull).toBe(true);
    expect(columns.content.notNull).toBe(true);
    expect(columns.version.notNull).toBe(true);
    expect(columns.version.hasDefault).toBe(true);
    expect(columns.deprecated.hasDefault).toBe(true);
    expect(columns.migratedTo.notNull).toBe(false);
    expect(columns.reviewStatus.getSQLType()).toBe('memory_review_status');
    expect(columns.reviewStatus.hasDefault).toBe(true);
    expect(columns.createdAt.notNull).toBe(true);
    expect(columns.createdAt.hasDefault).toBe(true);

    expect(tableConfig.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        'idx_memory_versions_node_id',
        'idx_memory_versions_tenant_id',
        'idx_memory_versions_review_status',
      ]),
    );
    expect(tableConfig.policies).toHaveLength(4);

    expect(describeForeignKeys(memoryVersions)).toEqual(
      expect.arrayContaining([
        {
          columns: ['node_id'],
          foreignColumns: ['id'],
          foreignTable: 'memory_nodes',
          onDelete: 'cascade',
        },
        {
          columns: ['migrated_to'],
          foreignColumns: ['id'],
          foreignTable: 'memory_versions',
          onDelete: 'set null',
        },
      ]),
    );
  });

  it('defines memory_edges with unique structural relationship, tenant column, and cascading node foreign keys', () => {
    const columns = getTableColumns(memoryEdges);
    const tableConfig = getTableConfig(memoryEdges);

    expect(tableConfig.name).toBe('memory_edges');
    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        'id',
        'instanceId',
        'tenantId',
        'parentNodeId',
        'childNodeId',
        'name',
        'priority',
        'disclosure',
        'createdAt',
      ]),
    );

    expect(columns.id.hasDefault).toBe(true);
    expect(columns.instanceId.notNull).toBe(true);
    expect(columns.tenantId.notNull).toBe(true);
    expect(columns.parentNodeId.notNull).toBe(true);
    expect(columns.childNodeId.notNull).toBe(true);
    expect(columns.name.getSQLType()).toBe('varchar(256)');
    expect(columns.priority.hasDefault).toBe(true);
    expect(columns.disclosure.hasDefault).toBe(true);
    expect(columns.createdAt.notNull).toBe(true);
    expect(columns.createdAt.hasDefault).toBe(true);

    expect(tableConfig.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        'uq_memory_edges_instance_parent_child',
        'idx_memory_edges_instance_id',
        'idx_memory_edges_parent_node_id',
        'idx_memory_edges_child_node_id',
        'idx_memory_edges_tenant_id',
      ]),
    );
    expect(tableConfig.policies).toHaveLength(4);

    expect(describeForeignKeys(memoryEdges)).toEqual(
      expect.arrayContaining([
        {
          columns: ['instance_id'],
          foreignColumns: ['id'],
          foreignTable: 'agent_memory_instances',
          onDelete: 'cascade',
        },
        {
          columns: ['parent_node_id'],
          foreignColumns: ['id'],
          foreignTable: 'memory_nodes',
          onDelete: 'cascade',
        },
        {
          columns: ['child_node_id'],
          foreignColumns: ['id'],
          foreignTable: 'memory_nodes',
          onDelete: 'cascade',
        },
      ]),
    );
  });

  it('defines memory_paths with unique instance/domain/path routing cache and nullable edge FK', () => {
    const columns = getTableColumns(memoryPaths);
    const tableConfig = getTableConfig(memoryPaths);

    expect(tableConfig.name).toBe('memory_paths');
    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        'id',
        'instanceId',
        'tenantId',
        'domain',
        'pathString',
        'edgeId',
        'nodeId',
        'createdAt',
      ]),
    );

    expect(columns.id.hasDefault).toBe(true);
    expect(columns.instanceId.notNull).toBe(true);
    expect(columns.tenantId.notNull).toBe(true);
    expect(columns.domain.notNull).toBe(true);
    expect(columns.domain.getSQLType()).toBe('varchar(64)');
    expect(columns.pathString.notNull).toBe(true);
    expect(columns.pathString.getSQLType()).toBe('varchar(512)');
    expect(columns.edgeId.notNull).toBe(false);
    expect(columns.nodeId.notNull).toBe(true);
    expect(columns.createdAt.notNull).toBe(true);
    expect(columns.createdAt.hasDefault).toBe(true);

    expect(tableConfig.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        'uq_memory_paths_instance_domain_path',
        'idx_memory_paths_instance_domain',
        'idx_memory_paths_node_id',
        'idx_memory_paths_tenant_id',
      ]),
    );
    expect(tableConfig.policies).toHaveLength(4);

    expect(describeForeignKeys(memoryPaths)).toEqual(
      expect.arrayContaining([
        {
          columns: ['instance_id'],
          foreignColumns: ['id'],
          foreignTable: 'agent_memory_instances',
          onDelete: 'cascade',
        },
        {
          columns: ['edge_id'],
          foreignColumns: ['id'],
          foreignTable: 'memory_edges',
          onDelete: 'set null',
        },
        {
          columns: ['node_id'],
          foreignColumns: ['id'],
          foreignTable: 'memory_nodes',
          onDelete: 'cascade',
        },
      ]),
    );
  });

  it('defines memory_glossary_keywords with unique keyword bindings and cascading node FK', () => {
    const columns = getTableColumns(memoryGlossaryKeywords);
    const tableConfig = getTableConfig(memoryGlossaryKeywords);

    expect(tableConfig.name).toBe('memory_glossary_keywords');
    expect(Object.keys(columns)).toEqual(
      expect.arrayContaining([
        'id',
        'instanceId',
        'tenantId',
        'keyword',
        'nodeId',
        'createdAt',
      ]),
    );

    expect(columns.id.hasDefault).toBe(true);
    expect(columns.instanceId.notNull).toBe(true);
    expect(columns.tenantId.notNull).toBe(true);
    expect(columns.keyword.notNull).toBe(true);
    expect(columns.keyword.getSQLType()).toBe('varchar(256)');
    expect(columns.nodeId.notNull).toBe(true);
    expect(columns.createdAt.notNull).toBe(true);
    expect(columns.createdAt.hasDefault).toBe(true);

    expect(tableConfig.indexes.map((index) => index.config.name)).toEqual(
      expect.arrayContaining([
        'uq_memory_glossary_keywords_instance_keyword_node',
        'idx_memory_glossary_keywords_instance_id',
        'idx_memory_glossary_keywords_keyword',
        'idx_memory_glossary_keywords_node_id',
        'idx_memory_glossary_keywords_tenant_id',
      ]),
    );
    expect(tableConfig.policies).toHaveLength(4);

    expect(describeForeignKeys(memoryGlossaryKeywords)).toEqual(
      expect.arrayContaining([
        {
          columns: ['instance_id'],
          foreignColumns: ['id'],
          foreignTable: 'agent_memory_instances',
          onDelete: 'cascade',
        },
        {
          columns: ['node_id'],
          foreignColumns: ['id'],
          foreignTable: 'memory_nodes',
          onDelete: 'cascade',
        },
      ]),
    );
  });

  it('adds tenant_id column to all agent memory tables', () => {
    const tables: MemoryGraphTable[] = [
      agentMemoryInstances,
      memoryNodes,
      memoryVersions,
      memoryEdges,
      memoryPaths,
      memoryGlossaryKeywords,
    ];

    for (const table of tables) {
      const columns = getTableColumns(table);

      expect(columns.tenantId).toBeDefined();
      expect(columns.tenantId.name).toBe('tenant_id');
      expect(columns.tenantId.notNull).toBe(true);
    }
  });
});
