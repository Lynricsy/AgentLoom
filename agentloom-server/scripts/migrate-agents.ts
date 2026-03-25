import 'dotenv/config';

import crypto from 'node:crypto';

import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  agentDefinitions,
  agentVersions,
  type AgentVersionSnapshot,
  type ReactFlowEdge,
  type ReactFlowNode,
  workflowDefinitions,
  workflowVersions,
  type WorkflowVersionSnapshot,
} from '../src/database/schema';
import type { SandboxConfig } from '../src/database/schema/sandbox-sessions.schema';

const SCRIPT_NAME = 'migrate-agents';
const MIGRATION_KEY = 'agentWorkflowSeparationMigration';
const MIGRATION_VERSION = 1;

const LEGACY_AGENT_NODE_TYPE = 'llm-agent';
const SANDBOX_NODE_TYPE = 'sandbox';
const WORKFLOW_AGENT_NODE_TYPE = 'agent';

const AGENT_CANVAS_NODE_TYPES = new Set<string>([
  'llm-model',
  'http-tool',
  'code-tool',
  'mcp-tool',
  'knowledge-base',
  'smart-routing',
]);

const CONTEXT_INPUT_HANDLES = new Set<string>([
  'context',
  'memory',
  'tool-results',
  'trigger-payload',
  'system-prompt',
]);

type JsonRecord = Record<string, unknown>;
type ScriptDb = ReturnType<typeof drizzle>;
type ScriptTransaction = Parameters<Parameters<ScriptDb['transaction']>[0]>[0];

interface ScriptArgs {
  help: boolean;
}

interface MigrationCandidate {
  llmAgentNode: ReactFlowNode;
  primarySandboxNode: ReactFlowNode;
  sandboxSourceNodeIds: string[];
  sandboxEdgeIds: string[];
  dependencyNodes: ReactFlowNode[];
  dependencyNodeIds: string[];
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

interface WorkflowTransformResult {
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
}

interface MigrationStats {
  workflowsScanned: number;
  workflowsMigrated: number;
  alreadyMigratedWorkflows: number;
  candidateAgents: number;
  migratedAgents: number;
}

function parseArgs(argv: string[]): ScriptArgs {
  return {
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

function printHelp(): void {
  console.log(`
${SCRIPT_NAME}

将旧版 workflow 中“llm-agent + sandbox”组合迁移为 Agent Definition + workflow agent 节点。

用法:
  npx tsx --no-warnings scripts/${SCRIPT_NAME}.ts
  npx tsx --no-warnings scripts/${SCRIPT_NAME}.ts --help

环境变量:
  DATABASE_URL   PostgreSQL 连接串（通过 dotenv/config 自动加载 .env）

行为:
  - 在单个数据库事务中执行（全量原子）
  - 为每个命中的 llm-agent 生成 agent_definitions + agent_versions
  - 在 workflow_definitions.metadata 中写入完整备份，便于 rollback
  - 同步更新 workflow_definitions 与 published workflow_versions.snapshot
  - 重复执行时会跳过已写入迁移元数据的 workflow
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

function readString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readNumber(record: JsonRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function sanitizeSlugPart(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized.length > 0 ? sanitized : 'migrated-agent';
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function getLegacyNodeData(node: ReactFlowNode): JsonRecord {
  return toRecord(node.data);
}

function getLegacyNodeLabel(node: ReactFlowNode): string {
  const data = getLegacyNodeData(node);
  return readString(data, 'label') ?? `Migrated ${node.id}`;
}

function getLegacySystemPrompt(node: ReactFlowNode): string | null {
  const data = getLegacyNodeData(node);
  return readString(data, 'systemPrompt') ?? readString(data, 'system_prompt') ?? null;
}

function hasMigrationMetadata(metadata: JsonRecord): boolean {
  return isRecord(metadata[MIGRATION_KEY]);
}

function resolveSandboxConfig(nodeData: JsonRecord): SandboxConfig {
  const nestedConfig = nodeData.config;
  const sandboxConfig = nodeData.sandboxConfig;
  const globalSandboxConfig = nodeData.globalSandboxConfig;

  let source: JsonRecord = nodeData;

  if (isRecord(nestedConfig)) {
    source = nestedConfig;
  } else if (isRecord(sandboxConfig)) {
    source = sandboxConfig;
  } else if (
    isRecord(globalSandboxConfig) &&
    isRecord(globalSandboxConfig.sandboxConfig)
  ) {
    source = globalSandboxConfig.sandboxConfig;
  } else if (isRecord(globalSandboxConfig)) {
    source = globalSandboxConfig;
  }

  return {
    cpu: readNumber(source, 'cpu') ?? 1,
    memory: readNumber(source, 'memory') ?? 512,
    disk: readNumber(source, 'disk') ?? 2,
    timeout: readNumber(source, 'timeout') ?? 2,
    ...(readString(source, 'persistencePath')
      ? { persistencePath: readString(source, 'persistencePath') }
      : {}),
  };
}

function buildSyntheticModelNode(llmAgentNode: ReactFlowNode): ReactFlowNode | null {
  const data = getLegacyNodeData(llmAgentNode);
  const modelId =
    readString(data, 'modelId') ??
    readString(data, 'model_id') ??
    readString(data, 'model');

  const modelData: JsonRecord = {
    ...(modelId ? { modelId } : {}),
    ...(readNumber(data, 'temperature') !== undefined
      ? { temperature: readNumber(data, 'temperature') }
      : {}),
    ...(readNumber(data, 'maxTokens') !== undefined
      ? { maxTokens: readNumber(data, 'maxTokens') }
      : readNumber(data, 'max_tokens') !== undefined
        ? { maxTokens: readNumber(data, 'max_tokens') }
        : {}),
    ...(readNumber(data, 'topP') !== undefined
      ? { topP: readNumber(data, 'topP') }
      : readNumber(data, 'top_p') !== undefined
        ? { topP: readNumber(data, 'top_p') }
        : {}),
    ...(readNumber(data, 'frequencyPenalty') !== undefined
      ? { frequencyPenalty: readNumber(data, 'frequencyPenalty') }
      : readNumber(data, 'frequency_penalty') !== undefined
        ? { frequencyPenalty: readNumber(data, 'frequency_penalty') }
        : {}),
    ...(readNumber(data, 'presencePenalty') !== undefined
      ? { presencePenalty: readNumber(data, 'presencePenalty') }
      : readNumber(data, 'presence_penalty') !== undefined
        ? { presencePenalty: readNumber(data, 'presence_penalty') }
        : {}),
  };

  if (Object.keys(modelData).length === 0) {
    return null;
  }

  return {
    id: `${llmAgentNode.id}__migrated_model`,
    type: 'llm-model',
    position: {
      x: llmAgentNode.position.x - 240,
      y: llmAgentNode.position.y,
    },
    data: {
      label: 'Migrated Model',
      ...modelData,
    },
  };
}

function collectDependencyNodes(
  llmAgentNode: ReactFlowNode,
  nodesById: Map<string, ReactFlowNode>,
  edges: ReactFlowEdge[],
): ReactFlowNode[] {
  const collected = new Map<string, ReactFlowNode>();

  for (const edge of edges) {
    if (edge.target !== llmAgentNode.id) {
      continue;
    }

    const sourceNode = nodesById.get(edge.source);
    if (!sourceNode || !AGENT_CANVAS_NODE_TYPES.has(sourceNode.type ?? '')) {
      continue;
    }

    collected.set(sourceNode.id, cloneJson(sourceNode));

    if (sourceNode.type === 'smart-routing') {
      for (const modelEdge of edges) {
        if (modelEdge.target !== sourceNode.id) {
          continue;
        }

        const modelNode = nodesById.get(modelEdge.source);
        if (modelNode?.type === 'llm-model') {
          collected.set(modelNode.id, cloneJson(modelNode));
        }
      }
    }
  }

  const hasModelConfig = [...collected.values()].some(
    (node) => node.type === 'llm-model' || node.type === 'smart-routing',
  );

  if (!hasModelConfig) {
    const syntheticModelNode = buildSyntheticModelNode(llmAgentNode);
    if (syntheticModelNode) {
      collected.set(syntheticModelNode.id, syntheticModelNode);
    }
  }

  return [...collected.values()];
}

function analyzeWorkflowCandidates(
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
): MigrationCandidate[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const candidates: MigrationCandidate[] = [];

  for (const node of nodes) {
    if (node.type !== LEGACY_AGENT_NODE_TYPE) {
      continue;
    }

    const incomingEdges = edges.filter((edge) => edge.target === node.id);
    const sandboxEdges = incomingEdges.filter(
      (edge) => nodesById.get(edge.source)?.type === SANDBOX_NODE_TYPE,
    );

    if (sandboxEdges.length === 0) {
      continue;
    }

    const sandboxSourceNodeIds = dedupeStrings(
      sandboxEdges
        .map((edge) => edge.source)
        .filter((sourceId) => nodesById.get(sourceId)?.type === SANDBOX_NODE_TYPE),
    );

    const primarySandboxNode = nodesById.get(sandboxSourceNodeIds[0] ?? '');
    if (!primarySandboxNode) {
      continue;
    }

    const dependencyNodes = collectDependencyNodes(node, nodesById, edges);

    candidates.push({
      llmAgentNode: cloneJson(node),
      primarySandboxNode: cloneJson(primarySandboxNode),
      sandboxSourceNodeIds,
      sandboxEdgeIds: sandboxEdges.map((edge) => edge.id),
      dependencyNodes,
      dependencyNodeIds: dependencyNodes.map((dependencyNode) => dependencyNode.id),
    });
  }

  return candidates;
}

async function ensureUniqueAgentSlug(
  tx: ScriptTransaction,
  tenantId: string,
  baseSlug: string,
): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const suffix = attempt === 0 ? '' : `-${attempt + 1}`;
    const candidateSlug = truncate(`${baseSlug}${suffix}`, 255);

    const [existing] = await tx
      .select({ id: agentDefinitions.id })
      .from(agentDefinitions)
      .where(
        and(
          eq(agentDefinitions.tenantId, tenantId),
          eq(agentDefinitions.slug, candidateSlug),
        ),
      )
      .limit(1);

    if (!existing) {
      return candidateSlug;
    }
  }

  throw new Error(`Unable to allocate unique slug for base slug: ${baseSlug}`);
}

function buildAgentSnapshot(
  nodes: ReactFlowNode[],
  systemPrompt: string | null,
  sandboxConfig: SandboxConfig,
  releaseNotes: string,
): AgentVersionSnapshot {
  return {
    nodes: cloneJson(nodes),
    edges: [],
    viewport: null,
    systemPrompt,
    sandboxConfig,
    metadata: {
      nodeCount: nodes.length,
      edgeCount: 0,
      createdFromVersion: 1,
      releaseNotes,
    },
  };
}

function buildWorkflowAgentNodeData(
  legacyNode: ReactFlowNode,
  createdAgent: CreatedAgentMigration,
): JsonRecord {
  const legacyData = getLegacyNodeData(legacyNode);
  const label = readString(legacyData, 'label') ?? createdAgent.agentName;

  return {
    label,
    selectedAgentId: createdAgent.agentDefinitionId,
    agentDefinitionId: createdAgent.agentDefinitionId,
    agent_definition_id: createdAgent.agentDefinitionId,
    agentVersionId: createdAgent.agentVersionId,
    agent_version_id: createdAgent.agentVersionId,
    agentName: createdAgent.agentName,
    versionLabel: createdAgent.versionLabel,
    config: {
      selectedAgentId: createdAgent.agentDefinitionId,
      agentDefinitionId: createdAgent.agentDefinitionId,
      agent_definition_id: createdAgent.agentDefinitionId,
      agentVersionId: createdAgent.agentVersionId,
      agent_version_id: createdAgent.agentVersionId,
      agentName: createdAgent.agentName,
      versionLabel: createdAgent.versionLabel,
      migratedFromWorkflowNodeId: createdAgent.workflowNodeId,
      migratedFromNodeType: LEGACY_AGENT_NODE_TYPE,
    },
  };
}

function isLikelyJsonSource(
  edge: ReactFlowEdge,
  sourceNode: ReactFlowNode | undefined,
): boolean {
  if (!sourceNode) {
    return false;
  }

  if (sourceNode.type === 'json-output') {
    return true;
  }

  const sourceHandle = edge.sourceHandle;
  if (
    typeof sourceHandle === 'string' &&
    ['json', 'structured', 'telemetry', 'payload'].some((token) =>
      sourceHandle.includes(token),
    )
  ) {
    return true;
  }

  const sourceData = getLegacyNodeData(sourceNode);
  return readString(sourceData, 'portType') === 'json';
}

function mapIncomingTargetHandle(
  edge: ReactFlowEdge,
  sourceNode: ReactFlowNode | undefined,
): string {
  if (
    typeof edge.targetHandle === 'string' &&
    CONTEXT_INPUT_HANDLES.has(edge.targetHandle)
  ) {
    return 'context';
  }

  return isLikelyJsonSource(edge, sourceNode) ? 'context' : 'text-input';
}

function mapOutgoingSourceHandle(
  edge: ReactFlowEdge,
  targetNode: ReactFlowNode | undefined,
): string {
  const sourceHandle = edge.sourceHandle;

  if (
    sourceHandle === 'structured-output' ||
    sourceHandle === 'telemetry' ||
    sourceHandle === 'evidence-requests'
  ) {
    return 'structured-output';
  }

  if (targetNode?.type === 'json-output') {
    return 'structured-output';
  }

  return 'agent-output';
}

function applyWorkflowMigration(
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
  createdAgents: CreatedAgentMigration[],
): WorkflowTransformResult {
  const migratedAgentByNodeId = new Map(
    createdAgents.map((createdAgent) => [createdAgent.workflowNodeId, createdAgent]),
  );
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const removableNodeIds = new Set<string>();
  for (const createdAgent of createdAgents) {
    for (const nodeId of createdAgent.sandboxSourceNodeIds) {
      removableNodeIds.add(nodeId);
    }
    for (const nodeId of createdAgent.dependencyNodeIds) {
      removableNodeIds.add(nodeId);
    }
  }

  const nextNodes = nodes.map((node) => {
    const createdAgent = migratedAgentByNodeId.get(node.id);
    if (!createdAgent) {
      return cloneJson(node);
    }

    return {
      ...cloneJson(node),
      type: WORKFLOW_AGENT_NODE_TYPE,
      data: buildWorkflowAgentNodeData(node, createdAgent),
    };
  });

  const nextEdges: ReactFlowEdge[] = [];
  for (const edge of edges) {
    const sourceMigration = migratedAgentByNodeId.get(edge.source);
    const targetMigration = migratedAgentByNodeId.get(edge.target);
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);

    if (targetMigration) {
      if (
        targetMigration.sandboxSourceNodeIds.includes(edge.source) ||
        targetMigration.dependencyNodeIds.includes(edge.source)
      ) {
        continue;
      }

      nextEdges.push({
        ...cloneJson(edge),
        targetHandle: mapIncomingTargetHandle(edge, sourceNode),
      });
      continue;
    }

    if (sourceMigration) {
      nextEdges.push({
        ...cloneJson(edge),
        sourceHandle: mapOutgoingSourceHandle(edge, targetNode),
      });
      continue;
    }

    nextEdges.push(cloneJson(edge));
  }

  const referencedNodeIds = new Set<string>();
  for (const edge of nextEdges) {
    referencedNodeIds.add(edge.source);
    referencedNodeIds.add(edge.target);
  }

  return {
    nodes: nextNodes.filter(
      (node) => !removableNodeIds.has(node.id) || referencedNodeIds.has(node.id),
    ),
    edges: nextEdges,
  };
}

function buildUpdatedPublishedSnapshot(
  snapshot: WorkflowVersionSnapshot,
  transform: WorkflowTransformResult,
): WorkflowVersionSnapshot {
  const metadata = toRecord(snapshot.metadata);
  const createdFromVersion = readNumber(metadata, 'createdFromVersion') ?? 1;

  return {
    ...cloneJson(snapshot),
    nodes: cloneJson(transform.nodes),
    edges: cloneJson(transform.edges),
    metadata: {
      ...metadata,
      nodeCount: transform.nodes.length,
      edgeCount: transform.edges.length,
      createdFromVersion,
    },
  };
}

async function createMigratedAgent(
  tx: ScriptTransaction,
  workflow: typeof workflowDefinitions.$inferSelect,
  candidate: MigrationCandidate,
): Promise<CreatedAgentMigration> {
  const createdAt = new Date();
  const agentDefinitionId = crypto.randomUUID();
  const agentVersionId = crypto.randomUUID();
  const legacyLabel = getLegacyNodeLabel(candidate.llmAgentNode);
  const agentName = truncate(`${workflow.name} · ${legacyLabel}`, 255);
  const baseSlug = truncate(
    sanitizeSlugPart(`${workflow.slug}-${candidate.llmAgentNode.id}-agent`),
    255,
  );
  const agentSlug = await ensureUniqueAgentSlug(tx, workflow.tenantId, baseSlug);
  const actorId = workflow.updatedBy;
  const systemPrompt = getLegacySystemPrompt(candidate.llmAgentNode);
  const sandboxConfig = resolveSandboxConfig(
    getLegacyNodeData(candidate.primarySandboxNode),
  );
  const versionLabel = truncate(`v1 - Migrated from ${workflow.slug}`, 255);
  const releaseNotes = `Migrated from workflow ${workflow.slug} (${candidate.llmAgentNode.id})`;

  await tx.insert(agentDefinitions).values({
    id: agentDefinitionId,
    tenantId: workflow.tenantId,
    name: agentName,
    slug: agentSlug,
    description: truncate(
      `自动从工作流“${workflow.name}”的节点“${legacyLabel}”迁移生成。`,
      1000,
    ),
    systemPrompt,
    nodes: cloneJson(candidate.dependencyNodes),
    edges: [],
    viewport: null,
    metadata: {
      migratedByScript: SCRIPT_NAME,
      migrationKey: MIGRATION_KEY,
      sourceWorkflowDefinitionId: workflow.id,
      sourceWorkflowSlug: workflow.slug,
      sourceWorkflowNodeId: candidate.llmAgentNode.id,
      sourceSandboxNodeIds: cloneJson(candidate.sandboxSourceNodeIds),
      originalNodeBackup: {
        llmAgentNode: cloneJson(candidate.llmAgentNode),
        sandboxNode: cloneJson(candidate.primarySandboxNode),
      },
    },
    sandboxConfig,
    version: 1,
    status: 'published',
    publishedVersionId: agentVersionId,
    createdBy: actorId,
    updatedBy: actorId,
    createdAt,
    updatedAt: createdAt,
  });

  await tx.insert(agentVersions).values({
    id: agentVersionId,
    agentDefinitionId,
    tenantId: workflow.tenantId,
    versionNumber: 1,
    label: versionLabel,
    snapshot: buildAgentSnapshot(
      candidate.dependencyNodes,
      systemPrompt,
      sandboxConfig,
      releaseNotes,
    ),
    publishedAt: createdAt,
    createdBy: actorId,
    createdAt,
  });

  return {
    workflowNodeId: candidate.llmAgentNode.id,
    sandboxSourceNodeIds: cloneJson(candidate.sandboxSourceNodeIds),
    sandboxEdgeIds: cloneJson(candidate.sandboxEdgeIds),
    dependencyNodeIds: cloneJson(candidate.dependencyNodeIds),
    agentDefinitionId,
    agentVersionId,
    agentName,
    agentSlug,
    versionLabel,
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
      const publishedVersionIds = workflows
        .map((workflow) => workflow.publishedVersionId)
        .filter((value): value is string => typeof value === 'string');

      const publishedVersions = publishedVersionIds.length
        ? await tx
            .select()
            .from(workflowVersions)
            .where(inArray(workflowVersions.id, publishedVersionIds))
        : [];

      const publishedVersionById = new Map(
        publishedVersions.map((version) => [version.id, version]),
      );

      const stats: MigrationStats = {
        workflowsScanned: workflows.length,
        workflowsMigrated: 0,
        alreadyMigratedWorkflows: 0,
        candidateAgents: 0,
        migratedAgents: 0,
      };

      for (const workflow of workflows) {
        const metadata = toRecord(workflow.metadata);
        if (hasMigrationMetadata(metadata)) {
          stats.alreadyMigratedWorkflows += 1;
          continue;
        }

        const workflowNodes = cloneJson(workflow.nodes);
        const workflowEdges = cloneJson(workflow.edges);
        const candidates = analyzeWorkflowCandidates(workflowNodes, workflowEdges);

        if (candidates.length === 0) {
          continue;
        }

        stats.candidateAgents += candidates.length;

        const createdAgents: CreatedAgentMigration[] = [];
        for (const candidate of candidates) {
          const createdAgent = await createMigratedAgent(tx, workflow, candidate);
          createdAgents.push(createdAgent);
        }

        const transform = applyWorkflowMigration(
          workflowNodes,
          workflowEdges,
          createdAgents,
        );

        const backup: WorkflowMigrationBackup = {
          version: MIGRATION_VERSION,
          script: SCRIPT_NAME,
          migratedAt: new Date().toISOString(),
          originalMetadata: cloneJson(metadata),
          originalNodes: cloneJson(workflowNodes),
          originalEdges: cloneJson(workflowEdges),
          originalWorkflowVersion: workflow.version,
          originalUpdatedAt: workflow.updatedAt.toISOString(),
          originalUpdatedBy: workflow.updatedBy,
          ...(workflow.publishedVersionId
            ? {
                originalPublishedVersionSnapshot: cloneJson(
                  publishedVersionById.get(workflow.publishedVersionId)?.snapshot,
                ),
              }
            : {}),
          agents: cloneJson(createdAgents),
        };

        if (
          workflow.publishedVersionId &&
          !backup.originalPublishedVersionSnapshot
        ) {
          throw new Error(
            `Workflow ${workflow.id} references missing published version ${workflow.publishedVersionId}`,
          );
        }

        await tx
          .update(workflowDefinitions)
          .set({
            nodes: cloneJson(transform.nodes),
            edges: cloneJson(transform.edges),
            metadata: {
              ...metadata,
              [MIGRATION_KEY]: backup,
            },
            version: workflow.version + 1,
            updatedBy: workflow.updatedBy,
            updatedAt: new Date(),
          })
          .where(eq(workflowDefinitions.id, workflow.id));

        if (
          workflow.publishedVersionId &&
          backup.originalPublishedVersionSnapshot
        ) {
          await tx
            .update(workflowVersions)
            .set({
              snapshot: buildUpdatedPublishedSnapshot(
                backup.originalPublishedVersionSnapshot,
                transform,
              ),
            })
            .where(eq(workflowVersions.id, workflow.publishedVersionId));
        }

        stats.workflowsMigrated += 1;
        stats.migratedAgents += createdAgents.length;
      }

      return stats;
    });

    console.log(`Migrated ${stats.migratedAgents} agents from ${stats.workflowsMigrated} workflows`);
    console.log(`Scanned ${stats.workflowsScanned} workflows`);

    if (stats.alreadyMigratedWorkflows > 0) {
      console.log(
        `Skipped ${stats.alreadyMigratedWorkflows} workflows that already contain ${MIGRATION_KEY} metadata`,
      );
    }

    if (stats.candidateAgents === 0) {
      console.log('No llm-agent nodes connected to sandbox nodes were found.');
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

run().catch((error: unknown) => {
  console.error('Failed to migrate agents:', error);
  process.exitCode = 1;
});
