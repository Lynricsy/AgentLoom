import 'dotenv/config';

import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  agentDefinitions,
  workflowDefinitions,
  workflowVersions,
  type ReactFlowEdge,
  type ReactFlowNode,
  type WorkflowVersionSnapshot,
} from '../src/database/schema';

const SCRIPT_NAME = 'migrate-agents-rollback';
const MIGRATION_KEY = 'agentWorkflowSeparationMigration';
const MIGRATION_VERSION = 1;

type JsonRecord = Record<string, unknown>;

interface ScriptArgs {
  help: boolean;
}

interface CreatedAgentMigration {
  workflowNodeId: string;
  sandboxSourceNodeIds: string[];
  sandboxEdgeIds: string[];
  dependencyNodeIds: string[];
  agentDefinitionId: string;
  agentVersionId: string;
  agentName: string;
  agentSlug: string;
  versionLabel: string;
}

interface WorkflowMigrationBackup {
  version: number;
  script: string;
  migratedAt: string;
  originalMetadata: JsonRecord;
  originalNodes: ReactFlowNode[];
  originalEdges: ReactFlowEdge[];
  originalWorkflowVersion: number;
  originalUpdatedAt: string;
  originalUpdatedBy: string;
  originalPublishedVersionSnapshot?: WorkflowVersionSnapshot;
  agents: CreatedAgentMigration[];
}

interface RollbackStats {
  workflowsScanned: number;
  workflowsRolledBack: number;
  restoredAgents: number;
}

function parseArgs(argv: string[]): ScriptArgs {
  return {
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

function printHelp(): void {
  console.log(`
${SCRIPT_NAME}

回滚 ${MIGRATION_KEY} 产生的数据改动。

用法:
  npx tsx --no-warnings scripts/${SCRIPT_NAME}.ts
  npx tsx --no-warnings scripts/${SCRIPT_NAME}.ts --help

环境变量:
  DATABASE_URL   PostgreSQL 连接串（通过 dotenv/config 自动加载 .env）

行为:
  - 在单个数据库事务中回滚
  - 读取 workflow_definitions.metadata.${MIGRATION_KEY} 里的完整备份
  - 恢复 workflow_definitions / published workflow_versions.snapshot
  - 删除迁移创建的 agent_definitions（agent_versions 通过 cascade 一并清理）
`);
}

function resolveDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('Missing DATABASE_URL environment variable');
  }

  return databaseUrl;
}

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function parseCreatedAgents(value: unknown): CreatedAgentMigration[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const parsed: CreatedAgentMigration[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const workflowNodeId = item.workflowNodeId;
    const agentDefinitionId = item.agentDefinitionId;
    const agentVersionId = item.agentVersionId;
    const agentName = item.agentName;
    const agentSlug = item.agentSlug;
    const versionLabel = item.versionLabel;

    if (
      typeof workflowNodeId !== 'string' ||
      typeof agentDefinitionId !== 'string' ||
      typeof agentVersionId !== 'string' ||
      typeof agentName !== 'string' ||
      typeof agentSlug !== 'string' ||
      typeof versionLabel !== 'string'
    ) {
      continue;
    }

    parsed.push({
      workflowNodeId,
      sandboxSourceNodeIds: isStringArray(item.sandboxSourceNodeIds)
        ? cloneJson(item.sandboxSourceNodeIds)
        : [],
      sandboxEdgeIds: isStringArray(item.sandboxEdgeIds)
        ? cloneJson(item.sandboxEdgeIds)
        : [],
      dependencyNodeIds: isStringArray(item.dependencyNodeIds)
        ? cloneJson(item.dependencyNodeIds)
        : [],
      agentDefinitionId,
      agentVersionId,
      agentName,
      agentSlug,
      versionLabel,
    });
  }

  return parsed;
}

function parseBackup(value: unknown): WorkflowMigrationBackup | null {
  if (!isRecord(value)) {
    return null;
  }

  const version = value.version;
  const originalMetadata = value.originalMetadata;
  const originalNodes = value.originalNodes;
  const originalEdges = value.originalEdges;
  const originalWorkflowVersion = value.originalWorkflowVersion;
  const originalUpdatedAt = value.originalUpdatedAt;
  const originalUpdatedBy = value.originalUpdatedBy;

  if (
    version !== MIGRATION_VERSION ||
    !isRecord(originalMetadata) ||
    !Array.isArray(originalNodes) ||
    !Array.isArray(originalEdges) ||
    typeof originalWorkflowVersion !== 'number' ||
    typeof originalUpdatedAt !== 'string' ||
    typeof originalUpdatedBy !== 'string'
  ) {
    return null;
  }

  return {
    version,
    script: typeof value.script === 'string' ? value.script : 'unknown',
    migratedAt: typeof value.migratedAt === 'string' ? value.migratedAt : '',
    originalMetadata: cloneJson(originalMetadata),
    originalNodes: cloneJson(originalNodes as ReactFlowNode[]),
    originalEdges: cloneJson(originalEdges as ReactFlowEdge[]),
    originalWorkflowVersion,
    originalUpdatedAt,
    originalUpdatedBy,
    ...(isRecord(value.originalPublishedVersionSnapshot) ||
    Array.isArray(value.originalPublishedVersionSnapshot)
      ? {
          originalPublishedVersionSnapshot: cloneJson(
            value.originalPublishedVersionSnapshot as WorkflowVersionSnapshot,
          ),
        }
      : {}),
    agents: parseCreatedAgents(value.agents),
  };
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const databaseUrl = resolveDatabaseUrl();
  const client = postgres(databaseUrl, {
    max: 1,
    prepare: false,
  });
  const db = drizzle(client);

  try {
    const stats = await db.transaction(async (tx) => {
      const workflows = await tx.select().from(workflowDefinitions);
      const stats: RollbackStats = {
        workflowsScanned: workflows.length,
        workflowsRolledBack: 0,
        restoredAgents: 0,
      };

      const agentDefinitionIdsToDelete = new Set<string>();

      for (const workflow of workflows) {
        const metadata = toRecord(workflow.metadata);
        const backup = parseBackup(metadata[MIGRATION_KEY]);

        if (!backup) {
          continue;
        }

        await tx
          .update(workflowDefinitions)
          .set({
            nodes: cloneJson(backup.originalNodes),
            edges: cloneJson(backup.originalEdges),
            metadata: cloneJson(backup.originalMetadata),
            version: backup.originalWorkflowVersion,
            updatedBy: backup.originalUpdatedBy,
            updatedAt: new Date(backup.originalUpdatedAt),
          })
          .where(eq(workflowDefinitions.id, workflow.id));

        if (workflow.publishedVersionId && backup.originalPublishedVersionSnapshot) {
          await tx
            .update(workflowVersions)
            .set({
              snapshot: cloneJson(backup.originalPublishedVersionSnapshot),
            })
            .where(eq(workflowVersions.id, workflow.publishedVersionId));
        }

        for (const agent of backup.agents) {
          agentDefinitionIdsToDelete.add(agent.agentDefinitionId);
        }

        stats.workflowsRolledBack += 1;
        stats.restoredAgents += backup.agents.length;
      }

      const ids = [...agentDefinitionIdsToDelete];
      if (ids.length > 0) {
        await tx
          .delete(agentDefinitions)
          .where(inArray(agentDefinitions.id, ids));
      }

      return stats;
    });

    console.log(`Rolled back ${stats.restoredAgents} agents from ${stats.workflowsRolledBack} workflows`);
    console.log(`Scanned ${stats.workflowsScanned} workflows`);

    if (stats.workflowsRolledBack === 0) {
      console.log(`No workflows contained ${MIGRATION_KEY} metadata.`);
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

run().catch((error: unknown) => {
  console.error('Failed to rollback agent migration:', error);
  process.exitCode = 1;
});
