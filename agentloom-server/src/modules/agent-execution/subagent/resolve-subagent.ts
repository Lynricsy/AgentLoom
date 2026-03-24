import type { AgentDefinitionDetailResponseDto } from '../../agent-definition/dto/agent-definition-response.dto';
import {
  AgentDefinitionService,
  type AgentVersionResponseDto,
} from '../../agent-definition/agent-definition.service';

export interface ResolveSubAgentParams {
  agentDefinitionId: string;
  agentVersionId?: string;
  tenantId: string;
  currentDepth: number;
  maxDepth: number;
  visitedIds: Set<string>;
  agentDefinitionService: AgentDefinitionService;
}

export interface ResolvedSubAgent {
  agentDefinition: AgentDefinitionDetailResponseDto;
  versionSnapshot: AgentVersionResponseDto | null;
}

const VERSION_PAGE_SIZE = 100;

export async function resolveSubAgent(
  params: ResolveSubAgentParams,
): Promise<ResolvedSubAgent> {
  if (params.currentDepth >= params.maxDepth) {
    throw new Error(
      `Sub-agent depth limit exceeded: maximum nesting depth of ${params.maxDepth} has been reached`,
    );
  }

  if (params.visitedIds.has(params.agentDefinitionId)) {
    throw new Error(
      `Circular sub-agent reference detected: agent "${params.agentDefinitionId}" has already been visited in this resolution chain`,
    );
  }

  const agentDefinition = await params.agentDefinitionService.findDetailById(
    params.agentDefinitionId,
  );

  if (agentDefinition.tenantId !== params.tenantId) {
    throw new Error(
      `Sub-agent not found: "${params.agentDefinitionId}" does not exist for tenant "${params.tenantId}"`,
    );
  }

  if (!agentDefinition.publishedVersionId) {
    throw new Error(
      `Sub-agent "${params.agentDefinitionId}" has no published version`,
    );
  }

  const versionId = params.agentVersionId ?? agentDefinition.publishedVersionId;
  const versionSnapshot = await findAgentVersion({
    agentDefinitionId: params.agentDefinitionId,
    versionId,
    agentDefinitionService: params.agentDefinitionService,
  });

  params.visitedIds.add(params.agentDefinitionId);

  return {
    agentDefinition,
    versionSnapshot,
  };
}

async function findAgentVersion(params: {
  agentDefinitionId: string;
  versionId: string;
  agentDefinitionService: AgentDefinitionService;
}): Promise<AgentVersionResponseDto | null> {
  let page = 1;

  while (true) {
    const response = await params.agentDefinitionService.listVersions(
      params.agentDefinitionId,
      page,
      VERSION_PAGE_SIZE,
    );

    const matchedVersion = response.data.find(
      (version) => version.id === params.versionId,
    );
    if (matchedVersion) {
      return matchedVersion;
    }

    if (page >= response.meta.totalPages) {
      return null;
    }

    page += 1;
  }
}
