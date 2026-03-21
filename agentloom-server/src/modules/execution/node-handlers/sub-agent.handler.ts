import { and, eq } from 'drizzle-orm';
import type { DrizzleDB } from '../../../database/database.module';
import * as schema from '../../../database/schema';
import type { AgentDefinition, AgentVersion } from '../../../database/schema';

export interface SubAgentNodeConfig {
  agentDefinitionId: string;
  agentVersionId?: string;
  inputMapping?: Record<string, unknown>;
}

export const MAX_SUB_AGENT_DEPTH = 5;

export interface ResolvedSubAgent {
  agentDefinition: AgentDefinition;
  versionSnapshot: AgentVersion | null;
}

export async function resolveSubAgent(
  config: SubAgentNodeConfig,
  db: DrizzleDB,
  tenantId: string,
  currentDepth = 0,
  visitedIds: Set<string> = new Set(),
): Promise<ResolvedSubAgent> {
  if (currentDepth >= MAX_SUB_AGENT_DEPTH) {
    throw new Error(
      `Sub-agent depth limit exceeded: maximum nesting depth of ${MAX_SUB_AGENT_DEPTH} has been reached`,
    );
  }

  if (visitedIds.has(config.agentDefinitionId)) {
    throw new Error(
      `Circular sub-agent reference detected: agent "${config.agentDefinitionId}" has already been visited in this resolution chain`,
    );
  }

  const [agent] = await db
    .select()
    .from(schema.agentDefinitions)
    .where(
      and(
        eq(schema.agentDefinitions.id, config.agentDefinitionId),
        eq(schema.agentDefinitions.tenantId, tenantId),
      ),
    );

  if (!agent) {
    throw new Error(
      `Sub-agent not found: "${config.agentDefinitionId}" does not exist for tenant "${tenantId}"`,
    );
  }

  if (!agent.publishedVersionId) {
    throw new Error(
      `Sub-agent "${config.agentDefinitionId}" has no published version`,
    );
  }

  const versionId = config.agentVersionId ?? agent.publishedVersionId;

  const [version] = await db
    .select()
    .from(schema.agentVersions)
    .where(
      and(
        eq(schema.agentVersions.id, versionId),
        eq(schema.agentVersions.agentDefinitionId, config.agentDefinitionId),
        eq(schema.agentVersions.tenantId, tenantId),
      ),
    );

  visitedIds.add(config.agentDefinitionId);

  return {
    agentDefinition: agent,
    versionSnapshot: version ?? null,
  };
}
