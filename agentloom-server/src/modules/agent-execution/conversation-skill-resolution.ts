import type { Logger } from '@nestjs/common';

import type { AgentVersionSnapshot } from '../../database/schema/agent-definitions.schema';
import type { SkillInput } from '../sandbox/pi-config-generator.service';
import type { SkillResolverService } from '../skill/skill-resolver.service';
import type { SkillPromptPayload } from '../skill/skill.types';
import { normalizeOptionalString } from './conversation-execution-metadata';

type WarningLogger = Pick<Logger, 'warn'>;

/** sandbox 运行态把技能作为 guest 会话 files 下发前的形状转换。 */
export function toSkillInput(skill: SkillPromptPayload): SkillInput {
  const files =
    skill.files && Object.keys(skill.files).length > 0
      ? skill.files
      : { 'SKILL.md': skill.content ?? '' };

  return {
    name: skill.name,
    description: skill.description,
    files,
  };
}

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

export type SkillAugmentedPrompt = {
  systemPrompt: string | undefined;
  /** 已注入提示词的技能；调用方需据此注册 `load_skill` 工具。 */
  skills: SkillPromptPayload[];
};

export async function resolveSkillAugmentedPrompt(
  params: SkillResolutionParams & { baseSystemPrompt?: string },
  skillResolverService: SkillResolverService | undefined,
  logger: WarningLogger,
): Promise<SkillAugmentedPrompt> {
  const unchanged = { systemPrompt: params.baseSystemPrompt, skills: [] };
  if (!skillResolverService) {
    return unchanged;
  }

  const skillIds = resolveConfiguredSkillIds(
    params.skillIds,
    params.nodes,
    params.edges,
  );

  if (!skillIds.length) {
    return unchanged;
  }

  try {
    const skills = await skillResolverService.resolveSkillsForAgent(
      params.tenantId,
      skillIds,
    );

    if (!skills.length) {
      return unchanged;
    }

    const augmentedPrompt = skillResolverService
      .buildSkillAugmentedPrompt(params.baseSystemPrompt ?? '', skills)
      .trim();

    return { systemPrompt: augmentedPrompt || undefined, skills };
  } catch (error) {
    logger.warn(
      `Failed to resolve skills for agent ${params.agentDefinitionId}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return unchanged;
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
