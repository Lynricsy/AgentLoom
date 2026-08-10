import type { Logger } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import type { DrizzleDB } from '../../database/database.module';
import { mcpServerConfigs } from '../../database/schema';
import type { AgentRuntimeConfig } from '../agent-definition/agent-runtime-config.interface';
import type { ResolvedModelConfig } from '../llm/pi-ai-adapter';
import type { LlmService } from '../llm/llm.service';
import type { McpService } from '../mcp/mcp.service';
import type {
  PiConfigInput,
  PiModelConfig,
  SkillInput,
} from '../sandbox/pi-config-generator.service';
import type { SkillPromptPayload } from '../skill/skill.types';
import { normalizeOptionalString } from './conversation-execution-metadata';

type WarningLogger = Pick<Logger, 'warn'>;

export async function buildPiConfigInput(
  params: {
    tenantId: string;
    runtimeConfig: AgentRuntimeConfig;
    systemPrompt?: string;
    skillPayloads?: SkillPromptPayload[];
  },
  llmService: LlmService | undefined,
  mcpService: McpService | undefined,
  db: DrizzleDB,
  logger: WarningLogger,
): Promise<PiConfigInput> {
  const [modelConfig, mcpServers] = await Promise.all([
    resolvePiModelConfig(
      params.runtimeConfig,
      params.tenantId,
      llmService,
      logger,
    ),
    resolvePiMcpServers(
      params.runtimeConfig,
      params.tenantId,
      mcpService,
      db,
      logger,
    ),
  ]);

  return {
    ...(params.systemPrompt ? { systemPrompt: params.systemPrompt } : {}),
    ...(modelConfig ? { modelConfig } : {}),
    ...(mcpServers ? { mcpServers } : {}),
    ...(params.skillPayloads?.length
      ? { skills: params.skillPayloads.map((skill) => toSkillInput(skill)) }
      : {}),
  };
}

export async function resolvePiModelConfig(
  runtimeConfig: AgentRuntimeConfig,
  tenantId: string,
  llmService: LlmService | undefined,
  logger: WarningLogger,
): Promise<PiModelConfig | undefined> {
  const runtimeModelConfig = runtimeConfig.modelConfig;
  const fallbackModelConfig =
    toPiModelConfigFromRuntimeModelConfig(runtimeModelConfig);
  const modelId = normalizeOptionalString(runtimeModelConfig?.modelId);

  if (!modelId || !llmService) {
    return fallbackModelConfig;
  }

  try {
    const modelConfig = await llmService.findById(modelId, tenantId);
    return toPiModelConfig(modelConfig);
  } catch (error) {
    if (!fallbackModelConfig) {
      throw error;
    }

    logger.warn(
      `Failed to load LLM model config ${modelId} for tenant ${tenantId}, falling back to node snapshot model data: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return fallbackModelConfig;
  }
}

export function toPiModelConfig(resolved: ResolvedModelConfig): PiModelConfig {
  const baseUrl = resolvePiModelBaseUrl(resolved);

  return {
    provider: resolved.provider.slug,
    model: resolved.modelId,
    apiProtocol: resolved.provider.apiProtocol,
    ...(baseUrl ? { apiBaseUrl: baseUrl } : {}),
    apiKeyId: resolved.provider.apiKeyId ?? null,
    organizationId: resolved.orgId,
    tenantId: resolved.tenantId,
  };
}

export function resolvePiModelBaseUrl(
  resolved: ResolvedModelConfig,
): string | undefined {
  const providerBaseUrl =
    resolved.provider.baseUrl ?? resolved.provider.defaultBaseUrl;
  if (
    typeof providerBaseUrl === 'string' &&
    providerBaseUrl.trim().length > 0
  ) {
    return providerBaseUrl.trim();
  }

  const parameters =
    resolved.parameters &&
    typeof resolved.parameters === 'object' &&
    !Array.isArray(resolved.parameters)
      ? (resolved.parameters as Record<string, unknown>)
      : {};

  const candidates = [
    parameters.baseUrl,
    parameters.baseURL,
    parameters.apiBaseUrl,
    parameters.endpointUrl,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return undefined;
}

export function toPiModelConfigFromRuntimeModelConfig(
  modelConfig?: AgentRuntimeConfig['modelConfig'],
): PiModelConfig | undefined {
  const provider = normalizeOptionalString(modelConfig?.provider);
  const model =
    normalizeOptionalString(modelConfig?.modelName) ??
    normalizeOptionalString(modelConfig?.modelId);

  if (!provider || !model) {
    return undefined;
  }

  const baseUrl = resolvePiRuntimeModelBaseUrl(modelConfig);
  const apiKeyId = modelConfig?.apiKeyId;
  const apiProtocol = normalizeOptionalString(modelConfig?.apiProtocol);
  const authMethod = normalizeOptionalString(modelConfig?.authMethod);

  return {
    provider,
    model,
    ...(apiProtocol ? { apiProtocol } : {}),
    ...(baseUrl ? { apiBaseUrl: baseUrl } : {}),
    ...(typeof apiKeyId === 'string' || apiKeyId === null ? { apiKeyId } : {}),
    ...(authMethod ? { authMethod } : {}),
  };
}

export function resolvePiRuntimeModelBaseUrl(
  modelConfig?: AgentRuntimeConfig['modelConfig'],
): string | undefined {
  const endpointUrl = normalizeOptionalString(modelConfig?.endpointUrl);
  if (endpointUrl) {
    return endpointUrl;
  }

  const parameters =
    modelConfig?.customParameters &&
    typeof modelConfig.customParameters === 'object' &&
    !Array.isArray(modelConfig.customParameters)
      ? (modelConfig.customParameters as Record<string, unknown>)
      : {};

  const candidates = [
    parameters.baseUrl,
    parameters.baseURL,
    parameters.apiBaseUrl,
    parameters.endpointUrl,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeOptionalString(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

export async function resolvePiMcpServers(
  runtimeConfig: AgentRuntimeConfig,
  tenantId: string,
  mcpService: McpService | undefined,
  db: DrizzleDB,
  logger: WarningLogger,
): Promise<PiConfigInput['mcpServers'] | undefined> {
  if (!mcpService) {
    return undefined;
  }

  const configIds = extractEnabledMcpServerConfigIds(runtimeConfig.tools);
  if (configIds.length === 0) {
    return undefined;
  }

  const savedConfigs = await runInTenantTransaction(
    db,
    tenantId,
    async (dbClient) =>
      dbClient
        .select({
          id: mcpServerConfigs.id,
          name: mcpServerConfigs.name,
        })
        .from(mcpServerConfigs)
        .where(
          and(
            eq(mcpServerConfigs.tenantId, tenantId),
            inArray(mcpServerConfigs.id, configIds),
          ),
        ),
  );
  const namesById = new Map(
    savedConfigs.map((config) => [config.id, config.name] as const),
  );

  const servers: NonNullable<PiConfigInput['mcpServers']> = {};
  for (const configId of configIds) {
    try {
      const connection = await mcpService.resolveRuntimeConnection(
        configId,
        tenantId,
      );
      const key = resolvePiMcpServerKey(
        configId,
        namesById.get(configId),
        servers,
      );
      servers[key] = connection;
    } catch (error) {
      logger.warn(
        `Failed to resolve MCP server config ${configId} for conversation runtime: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return Object.keys(servers).length > 0 ? servers : undefined;
}

export function extractEnabledMcpServerConfigIds(
  tools: AgentRuntimeConfig['tools'],
): string[] {
  if (!tools?.length) {
    return [];
  }

  const ids = new Set<string>();

  for (const tool of tools) {
    if (tool.enabled === false) {
      continue;
    }

    if (!('mcpServerConfigId' in tool)) {
      continue;
    }

    if (
      typeof tool.mcpServerConfigId === 'string' &&
      tool.mcpServerConfigId.trim().length > 0
    ) {
      ids.add(tool.mcpServerConfigId.trim());
    }
  }

  return [...ids];
}

export function resolvePiMcpServerKey(
  configId: string,
  configName: string | undefined,
  existingServers: Record<string, unknown>,
): string {
  const base =
    sanitizePiMcpServerKey(configName) ??
    sanitizePiMcpServerKey(configId) ??
    'mcp_server';

  if (!(base in existingServers)) {
    return base;
  }

  let suffix = 2;
  while (`${base}_${suffix}` in existingServers) {
    suffix += 1;
  }

  return `${base}_${suffix}`;
}

export function sanitizePiMcpServerKey(
  value: string | undefined,
): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized.length > 0 ? normalized : undefined;
}

/**
 * Convert a SkillPromptPayload to a SkillInput for PiConfigInput.
 */
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
