import 'dotenv/config';

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  agentDefinitions,
  agentVersions,
  workflowDefinitions,
  workflowVersions,
} from '../src/database/schema';
import {
  migrateAgentCanvasGraph,
  migrateAgentVersionSnapshot,
  migrateWorkflowGraph,
} from '../src/modules/agent-definition/agent-input-node-migration.util';

const SCRIPT_NAME = 'migrate-agent-input-nodes';

interface ScriptArgs {
  help: boolean;
  dryRun: boolean;
}

interface MigrationStats {
  agentDefinitionsScanned: number;
  agentDefinitionsChanged: number;
  agentVersionsScanned: number;
  agentVersionsChanged: number;
  workflowDefinitionsScanned: number;
  workflowDefinitionsChanged: number;
  workflowVersionsScanned: number;
  workflowVersionsChanged: number;
}

class DryRunRollback extends Error {
  constructor(readonly stats: MigrationStats) {
    super('dry-run rollback');
  }
}

function parseArgs(argv: string[]): ScriptArgs {
  return {
    help: argv.includes('--help') || argv.includes('-h'),
    dryRun: argv.includes('--dry-run'),
  };
}

function printHelp(): void {
  console.log(`
${SCRIPT_NAME}

将 Agent / Workflow 中旧的 systemPrompt / sub-agent 输入结构预迁移到新节点模型。

用法:
  npx tsx --no-warnings scripts/${SCRIPT_NAME}.ts
  npx tsx --no-warnings scripts/${SCRIPT_NAME}.ts --dry-run
  npx tsx --no-warnings scripts/${SCRIPT_NAME}.ts --help

环境变量:
  DATABASE_URL / APP_DATABASE_URL  PostgreSQL 连接串

行为:
  - 预迁移 agent_definitions
  - 预迁移 agent_versions.snapshot
  - 预迁移 workflow_definitions
  - 预迁移 workflow_versions.snapshot
  - --dry-run 下会统计并打印结果，但在事务末尾回滚
`);
}

function resolveDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Missing DATABASE_URL or APP_DATABASE_URL');
  }

  return databaseUrl;
}

function createEmptyStats(): MigrationStats {
  return {
    agentDefinitionsScanned: 0,
    agentDefinitionsChanged: 0,
    agentVersionsScanned: 0,
    agentVersionsChanged: 0,
    workflowDefinitionsScanned: 0,
    workflowDefinitionsChanged: 0,
    workflowVersionsScanned: 0,
    workflowVersionsChanged: 0,
  };
}

function printStats(stats: MigrationStats, dryRun: boolean): void {
  console.log(
    JSON.stringify(
      {
        script: SCRIPT_NAME,
        mode: dryRun ? 'dry-run' : 'apply',
        ...stats,
      },
      null,
      2,
    ),
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const connection = postgres(resolveDatabaseUrl(), {
    max: 1,
    prepare: false,
  });
  const db = drizzle(connection);
  const now = new Date();
  const stats = createEmptyStats();

  try {
    await db.transaction(async (tx) => {
      const draftAgents = await tx
        .select({
          id: agentDefinitions.id,
          nodes: agentDefinitions.nodes,
          edges: agentDefinitions.edges,
          systemPrompt: agentDefinitions.systemPrompt,
          version: agentDefinitions.version,
          updatedBy: agentDefinitions.updatedBy,
        })
        .from(agentDefinitions);

      for (const definition of draftAgents) {
        stats.agentDefinitionsScanned += 1;
        const migrated = migrateAgentCanvasGraph({
          nodes: definition.nodes ?? [],
          edges: definition.edges ?? [],
          systemPrompt: definition.systemPrompt,
        });

        if (!migrated.changed) {
          continue;
        }

        stats.agentDefinitionsChanged += 1;
        await tx
          .update(agentDefinitions)
          .set({
            nodes: migrated.nodes,
            edges: migrated.edges,
            systemPrompt: migrated.systemPrompt ?? null,
            version: definition.version + 1,
            updatedBy: definition.updatedBy,
            updatedAt: now,
          })
          .where(eq(agentDefinitions.id, definition.id));
      }

      const publishedAgents = await tx
        .select({
          id: agentVersions.id,
          snapshot: agentVersions.snapshot,
        })
        .from(agentVersions);

      for (const version of publishedAgents) {
        stats.agentVersionsScanned += 1;
        const migrated = migrateAgentVersionSnapshot(version.snapshot);
        if (!migrated.changed) {
          continue;
        }

        stats.agentVersionsChanged += 1;
        await tx
          .update(agentVersions)
          .set({
            snapshot: migrated.snapshot,
          })
          .where(eq(agentVersions.id, version.id));
      }

      const workflows = await tx
        .select({
          id: workflowDefinitions.id,
          nodes: workflowDefinitions.nodes,
          edges: workflowDefinitions.edges,
          version: workflowDefinitions.version,
          updatedBy: workflowDefinitions.updatedBy,
        })
        .from(workflowDefinitions);

      for (const definition of workflows) {
        stats.workflowDefinitionsScanned += 1;
        const migrated = migrateWorkflowGraph({
          nodes: definition.nodes ?? [],
          edges: definition.edges ?? [],
        });
        if (!migrated.changed) {
          continue;
        }

        stats.workflowDefinitionsChanged += 1;
        await tx
          .update(workflowDefinitions)
          .set({
            nodes: migrated.nodes,
            edges: migrated.edges,
            version: definition.version + 1,
            updatedBy: definition.updatedBy,
            updatedAt: now,
          })
          .where(eq(workflowDefinitions.id, definition.id));
      }

      const workflowSnapshots = await tx
        .select({
          id: workflowVersions.id,
          snapshot: workflowVersions.snapshot,
        })
        .from(workflowVersions);

      for (const version of workflowSnapshots) {
        stats.workflowVersionsScanned += 1;
        const migrated = migrateWorkflowGraph({
          nodes: version.snapshot.nodes ?? [],
          edges: version.snapshot.edges ?? [],
        });
        if (!migrated.changed) {
          continue;
        }

        stats.workflowVersionsChanged += 1;
        await tx
          .update(workflowVersions)
          .set({
            snapshot: {
              ...version.snapshot,
              nodes: migrated.nodes,
              edges: migrated.edges,
            },
          })
          .where(eq(workflowVersions.id, version.id));
      }

      if (args.dryRun) {
        throw new DryRunRollback(stats);
      }
    });

    printStats(stats, false);
  } catch (error) {
    if (error instanceof DryRunRollback) {
      printStats(error.stats, true);
      return;
    }

    throw error;
  } finally {
    await connection.end({ timeout: 5 });
  }
}

void main().catch((error) => {
  console.error(
    `[${SCRIPT_NAME}] failed:`,
    error instanceof Error ? error.stack ?? error.message : error,
  );
  process.exitCode = 1;
});
