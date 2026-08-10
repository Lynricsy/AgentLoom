import type { Logger } from '@nestjs/common';

import type { AgentVersionSnapshot } from '../../database/schema/agent-definitions.schema';
import type { SkillResolverService } from '../skill/skill-resolver.service';
import type { SkillPromptPayload } from '../skill/skill.types';
import { normalizeOptionalString } from './conversation-execution-metadata';

type WarningLogger = Pick<Logger, 'warn'>;

type SkillResolutionParams = {
  tenantId: string;
  agentDefinitionId: string;
  skillIds?: string[];
  nodes: AgentVersionSnapshot['nodes'];
  edges: AgentVersionSnapshot['edges'];
};

export async function resolveSkillPayloadsForGraph(
  params: SkillResolutionParams,
  skillResolverService: SkillResolverService | undefined,
  logger: WarningLogger,
): Promise<SkillPromptPayload[]> {
  if (!skillResolverService) {
    return [];
  }

  const skillIds = resolveConfiguredSkillIds(
    params.skillIds,
    params.nodes,
    params.edges,
  );

  if (!skillIds.length) {
    return [];
  }

  try {
    return await skillResolverService.resolveSkillsForAgent(
      params.tenantId,
      skillIds,
    );
  } catch (error) {
    logger.warn(
      `Failed to resolve skill payloads for agent ${params.agentDefinitionId}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}

export async function resolveSkillAugmentedPrompt(
  params: SkillResolutionParams & { baseSystemPrompt?: string },
  skillResolverService: SkillResolverService | undefined,
  logger: WarningLogger,
): Promise<string | undefined> {
  if (!skillResolverService) {
    return params.baseSystemPrompt;
  }

  const skillIds = resolveConfiguredSkillIds(
    params.skillIds,
    params.nodes,
    params.edges,
  );

  if (!skillIds.length) {
    return params.baseSystemPrompt;
  }

  try {
    const skills = await skillResolverService.resolveSkillsForAgent(
      params.tenantId,
      skillIds,
    );

    if (!skills.length) {
      return params.baseSystemPrompt;
    }

    const augmentedPrompt = skillResolverService
      .buildSkillAugmentedPrompt(params.baseSystemPrompt ?? '', skills)
      .trim();

    return augmentedPrompt || undefined;
  } catch (error) {
    logger.warn(
      `Failed to resolve skills for agent ${params.agentDefinitionId}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return params.baseSystemPrompt;
  }
}

export function extractConversationSkillIds(
  nodes: AgentVersionSnapshot['nodes'],
  edges: AgentVersionSnapshot['edges'],
): string[] {
  const skillNodes = nodes.filter(
    (node) => resolveCanvasNodeType(node) === 'skill',
  );
  if (!skillNodes.length) {
    return [];
  }

  const agentMainNode = nodes.find(
    (node) => resolveCanvasNodeType(node) === 'agent-main',
  );
  const agentMainId =
    typeof agentMainNode?.id === 'string' ? agentMainNode.id : null;
  const activeSkillNodes = agentMainId
    ? skillNodes.filter((node) =>
        edges.some(
          (edge) =>
            edge?.source === node.id &&
            edge?.target === agentMainId &&
            edge?.targetHandle === 'skills-in',
        ),
      )
    : skillNodes;

  return [
    ...new Set(activeSkillNodes.map((node) => extractSkillId(node))),
  ].filter(
    (skillId): skillId is string =>
      typeof skillId === 'string' && skillId.length > 0,
  );
}

export function extractSkillId(
  node: AgentVersionSnapshot['nodes'][number],
): string | null {
  const skillId = normalizeOptionalString(resolveCanvasNodeData(node).skillId);
  if (skillId) {
    return skillId;
  }

  return null;
}

export function resolveConfiguredSkillIds(
  runtimeSkillIds: string[] | undefined,
  nodes: AgentVersionSnapshot['nodes'],
  edges: AgentVersionSnapshot['edges'],
): string[] {
  const normalizedRuntimeSkillIds = normalizeRuntimeSkillIds(runtimeSkillIds);
  if (normalizedRuntimeSkillIds.length > 0) {
    return normalizedRuntimeSkillIds;
  }

  return extractConversationSkillIds(nodes ?? [], edges ?? []);
}

export function normalizeRuntimeSkillIds(
  skillIds: string[] | undefined,
): string[] {
  if (!Array.isArray(skillIds)) {
    return [];
  }

  return [
    ...new Set(
      skillIds
        .map((skillId) => normalizeOptionalString(skillId))
        .filter((skillId): skillId is string => typeof skillId === 'string'),
    ),
  ];
}

export function resolveCanvasNodeType(
  node: AgentVersionSnapshot['nodes'][number],
): string {
  const nodeData =
    node.data && typeof node.data === 'object' && !Array.isArray(node.data)
      ? (node.data as Record<string, unknown>)
      : null;
  const nodeType = nodeData?.nodeType;

  if (typeof nodeType === 'string' && nodeType.length > 0) {
    return nodeType;
  }

  return typeof node.type === 'string' ? node.type : '';
}

export function resolveCanvasNodeData(
  node: AgentVersionSnapshot['nodes'][number],
): Record<string, unknown> {
  const nodeData =
    node.data && typeof node.data === 'object' && !Array.isArray(node.data)
      ? (node.data as Record<string, unknown>)
      : {};
  const config =
    nodeData.config &&
    typeof nodeData.config === 'object' &&
    !Array.isArray(nodeData.config)
      ? (nodeData.config as Record<string, unknown>)
      : {};

  return {
    ...config,
    ...nodeData,
  };
}
