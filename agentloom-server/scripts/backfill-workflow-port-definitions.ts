import 'dotenv/config';

import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  type WorkflowVersionSnapshot,
  workflowDefinitions,
  workflowVersions,
} from '../src/database/schema';
import { normalizeWorkflowNodesAndEdges } from '../src/modules/workflow-definition/utils/normalize-workflow-graph.utils';

interface ScriptArgs {
  help: boolean;
  dryRun: boolean;
  workflowId?: string;
  tenantId?: string;
}

interface BackfillStats {
  workflowsScanned: number;
  workflowsUpdated: number;
  workflowVersionsScanned: number;
  workflowVersionsUpdated: number;
}

function parseArgs(argv: string[]): ScriptArgs {
  const args: ScriptArgs = {
    help: argv.includes('--help') || argv.includes('-h'),
    dryRun: argv.includes('--dry-run'),
  };

  const workflowIndex = argv.findIndex((arg) => arg === '--workflow-id');
  if (workflowIndex >= 0 && typeof argv[workflowIndex + 1] === 'string') {
    args.workflowId = argv[workflowIndex + 1];
  }

  const tenantIndex = argv.findIndex((arg) => arg === '--tenant-id');
  if (tenantIndex >= 0 && typeof argv[tenantIndex + 1] === 'string') {
    args.tenantId = argv[tenantIndex + 1];
  }

  return args;
}

function printHelp(): void {
  console.log(`
backfill-workflow-port-definitions

批量回填 workflow_definitions / workflow_versions.snapshot 中缺失的 PortDefinition 字段。

用法:
  pnpm exec tsx scripts/backfill-workflow-port-definitions.ts
  pnpm exec tsx scripts/backfill-workflow-port-definitions.ts --dry-run
  pnpm exec tsx scripts/backfill-workflow-port-definitions.ts --workflow-id <uuid>
  pnpm exec tsx scripts/backfill-workflow-port-definitions.ts --tenant-id <uuid>

环境变量:
  DATABASE_URL 或 APP_DATABASE_URL
`);
}

function resolveDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('Missing DATABASE_URL or APP_DATABASE_URL');
  }

  return databaseUrl;
}

function normalizeSnapshot(
  snapshot: WorkflowVersionSnapshot,
): WorkflowVersionSnapshot {
  const normalizedGraph = normalizeWorkflowNodesAndEdges(
    snapshot.nodes ?? [],
    snapshot.edges ?? [],
  );

  return {
    ...snapshot,
    nodes: normalizedGraph.nodes,
    edges: normalizedGraph.edges,
  };
}

function serializeJson(value: unknown): string {
  return JSON.stringify(value);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const databaseUrl = resolveDatabaseUrl();
  const sqlClient = postgres(databaseUrl, {
    max: 1,
  });
  const db = drizzle(sqlClient);
  const stats: BackfillStats = {
    workflowsScanned: 0,
    workflowsUpdated: 0,
    workflowVersionsScanned: 0,
    workflowVersionsUpdated: 0,
  };

  try {
    const workflowFilters = [];
    if (args.workflowId) {
      workflowFilters.push(eq(workflowDefinitions.id, args.workflowId));
    }
    if (args.tenantId) {
      workflowFilters.push(eq(workflowDefinitions.tenantId, args.tenantId));
    }

    const workflows = await db
      .select({
        id: workflowDefinitions.id,
        tenantId: workflowDefinitions.tenantId,
        nodes: workflowDefinitions.nodes,
        edges: workflowDefinitions.edges,
      })
      .from(workflowDefinitions)
      .where(workflowFilters.length > 0 ? and(...workflowFilters) : undefined);

    for (const workflow of workflows) {
      stats.workflowsScanned += 1;
      const normalizedGraph = normalizeWorkflowNodesAndEdges(
        workflow.nodes ?? [],
        workflow.edges ?? [],
      );

      if (
        serializeJson(normalizedGraph.nodes) === serializeJson(workflow.nodes) &&
        serializeJson(normalizedGraph.edges) === serializeJson(workflow.edges)
      ) {
        continue;
      }

      stats.workflowsUpdated += 1;
      if (!args.dryRun) {
        await db
          .update(workflowDefinitions)
          .set({
            nodes: normalizedGraph.nodes,
            edges: normalizedGraph.edges,
          })
          .where(eq(workflowDefinitions.id, workflow.id));
      }
    }

    const versionFilters = [];
    if (args.workflowId) {
      versionFilters.push(
        eq(workflowVersions.workflowDefinitionId, args.workflowId),
      );
    }
    if (args.tenantId) {
      versionFilters.push(eq(workflowVersions.tenantId, args.tenantId));
    }

    const versions = await db
      .select({
        id: workflowVersions.id,
        workflowDefinitionId: workflowVersions.workflowDefinitionId,
        snapshot: workflowVersions.snapshot,
      })
      .from(workflowVersions)
      .where(versionFilters.length > 0 ? and(...versionFilters) : undefined);

    for (const version of versions) {
      stats.workflowVersionsScanned += 1;
      const normalizedSnapshot = normalizeSnapshot(version.snapshot);

      if (
        serializeJson(normalizedSnapshot) === serializeJson(version.snapshot)
      ) {
        continue;
      }

      stats.workflowVersionsUpdated += 1;
      if (!args.dryRun) {
        await db
          .update(workflowVersions)
          .set({
            snapshot: normalizedSnapshot,
          })
          .where(eq(workflowVersions.id, version.id));
      }
    }

    console.log(
      JSON.stringify(
        {
          script: 'backfill-workflow-port-definitions',
          dryRun: args.dryRun,
          workflowId: args.workflowId ?? null,
          tenantId: args.tenantId ?? null,
          ...stats,
        },
        null,
        2,
      ),
    );
  } finally {
    await sqlClient.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
