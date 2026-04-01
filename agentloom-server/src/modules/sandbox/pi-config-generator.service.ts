import { Injectable } from '@nestjs/common';

import type { McpServerConfig } from '../agent/types/agent-session.types';
import { PRIVATE_CLOUD_NO_AUTH_PLACEHOLDER } from '../llm/private-cloud-auth.constants';

export interface PiModelConfig {
  provider: string;
  model: string;
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  apiBaseUrl?: string;
  apiKeyId?: string | null;
  organizationId?: string;
  tenantId?: string;
  authMethod?: string | null;
}

export interface SkillInput {
  name: string;
  description: string;
  /** Map of filename to content. Must contain a "SKILL.md" entry. */
  files: Record<string, string>;
}

export interface PiConfigInput {
  systemPrompt?: string | null;
  modelConfig?: PiModelConfig | null;
  skills?: SkillInput[];
  mcpServers?: Record<string, McpServerConfig>;
}

export interface PiConfigBundle {
  settings: string;
  models: string;
  systemPrompt: string;
  /** Outer key = skill directory name (kebab-case), inner map = filename → content */
  skills: Record<string, Record<string, string>>;
  /** JSON string of MCP server configurations keyed by server name */
  mcpServers: string;
}

// Maps AgentLoom provider name → pi-ai API identifier
const PROVIDER_API_MAP: Record<string, string> = {
  anthropic: 'anthropic-messages',
  openai: 'openai-completions',
  google: 'google-generative-ai',
  deepseek: 'openai-completions',
  custom: 'openai-completions',
  'azure-openai': 'azure-openai-responses',
  xai: 'openai-completions',
  groq: 'openai-completions',
  openrouter: 'openai-completions',
  bedrock: 'bedrock-converse-stream',
};

/** Default base URLs for known providers (pi-ai will use built-in defaults if omitted) */
const PROVIDER_BASE_URL_MAP: Record<string, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com',
  deepseek: 'https://api.deepseek.com/v1',
  'azure-openai': 'https://openai.azure.com',
  xai: 'https://api.x.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  bedrock: 'https://bedrock-runtime.us-east-1.amazonaws.com',
};

/**
 * Maps provider name → environment variable name for API key.
 * pi-mono's resolveConfigValue() looks up process.env[value] first,
 * so these match the env vars injected by DockerService.createContainer().
 */
const PROVIDER_API_KEY_ENV_MAP: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  custom: 'CUSTOM_API_KEY',
  private_cloud: 'PRIVATE_CLOUD_API_KEY',
  'azure-openai': 'AZURE_OPENAI_API_KEY',
  xai: 'XAI_API_KEY',
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  bedrock: 'AWS_ACCESS_KEY_ID',
};

const OPENAI_COMPAT_APIS = new Set(['openai-completions']);

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function hasTerminalPath(baseUrl: string, suffix: string): boolean {
  return trimTrailingSlashes(baseUrl)
    .toLowerCase()
    .endsWith(suffix.toLowerCase());
}

function appendTerminalPath(baseUrl: string, suffix: string): string {
  if (hasTerminalPath(baseUrl, suffix)) {
    return trimTrailingSlashes(baseUrl);
  }

  return `${trimTrailingSlashes(baseUrl)}${suffix}`;
}

function stripTerminalPath(baseUrl: string, suffix: string): string {
  const trimmedBaseUrl = trimTrailingSlashes(baseUrl);
  if (!hasTerminalPath(trimmedBaseUrl, suffix)) {
    return trimmedBaseUrl;
  }

  const normalizedSuffix = trimTrailingSlashes(suffix);
  return trimmedBaseUrl.slice(0, -normalizedSuffix.length) || trimmedBaseUrl;
}

function resolvePrivateCloudApi(model: string): string {
  if (model.trim().toLowerCase().startsWith('claude')) {
    return 'anthropic-messages';
  }

  return 'openai-responses';
}

export function resolvePiModelApi(
  modelConfig: Pick<PiModelConfig, 'provider' | 'model'>,
): string {
  if (modelConfig.provider === 'private_cloud') {
    return resolvePrivateCloudApi(modelConfig.model);
  }

  return (
    PROVIDER_API_MAP[modelConfig.provider] ??
    `${modelConfig.provider}-completions`
  );
}

export function resolvePiModelBaseUrl(
  modelConfig: Pick<PiModelConfig, 'provider' | 'apiBaseUrl' | 'model'>,
  api: string,
): string | undefined {
  const baseUrl =
    modelConfig.apiBaseUrl ??
    PROVIDER_BASE_URL_MAP[modelConfig.provider] ??
    undefined;

  if (!baseUrl) {
    return undefined;
  }

  if (api === 'openai-completions' || api === 'openai-responses') {
    return appendTerminalPath(baseUrl, '/v1');
  }

  if (api === 'anthropic-messages') {
    return stripTerminalPath(baseUrl, '/v1');
  }

  return trimTrailingSlashes(baseUrl);
}

export function resolvePiProviderApiKeyEnv(
  modelConfig: Pick<PiModelConfig, 'provider' | 'authMethod'>,
): string | undefined {
  if (
    modelConfig.provider === 'private_cloud' &&
    modelConfig.authMethod &&
    modelConfig.authMethod !== 'api_key'
  ) {
    return undefined;
  }

  return (
    PROVIDER_API_KEY_ENV_MAP[modelConfig.provider] ??
    `${modelConfig.provider.toUpperCase().replace(/-/g, '_')}_API_KEY`
  );
}

function resolvePiProviderCompat(
  modelConfig: PiModelConfig,
  api: string,
): Record<string, unknown> | undefined {
  if (!OPENAI_COMPAT_APIS.has(api)) {
    return undefined;
  }

  return {
    supportsDeveloperRole: false,
    supportsReasoningEffort: false,
    maxTokensField: 'max_tokens',
  };
}

function resolvePiProviderHeaders(
  modelConfig: PiModelConfig,
): Record<string, string> | undefined {
  if (
    modelConfig.provider === 'private_cloud' &&
    modelConfig.authMethod &&
    modelConfig.authMethod !== 'api_key'
  ) {
    return {
      // 覆盖 OpenAI SDK 基于占位 apiKey 自动拼出的 Bearer 头。
      Authorization: '',
    };
  }

  return undefined;
}

function resolvePiProviderInlineApiKey(
  modelConfig: PiModelConfig,
): string | undefined {
  if (
    modelConfig.provider === 'private_cloud' &&
    modelConfig.authMethod &&
    modelConfig.authMethod !== 'api_key'
  ) {
    return PRIVATE_CLOUD_NO_AUTH_PLACEHOLDER;
  }

  return undefined;
}

@Injectable()
export class PiConfigGeneratorService {
  /**
   * Generate settings.json content for the pi-coding-agent container.
   *
   * Maps AgentLoom model config → pi Settings shape.
   * No API keys — those are injected via env vars.
   */
  generateSettings(input: PiConfigInput): string {
    const modelCfg = input.modelConfig;

    const settings: Record<string, unknown> = {
      // Compaction enabled by default for long-running agentic sessions
      compaction: { enabled: true },
      // Standard retry policy
      retry: { enabled: true, maxRetries: 3, baseDelayMs: 2000 },
    };

    if (modelCfg?.provider) {
      settings.defaultProvider = modelCfg.provider;
    }
    if (modelCfg?.model) {
      settings.defaultModel = modelCfg.model;
    }
    if (modelCfg?.thinkingLevel) {
      settings.defaultThinkingLevel = modelCfg.thinkingLevel;
    }

    return JSON.stringify(settings, null, 2);
  }

  /**
   * Generate models.json content for the pi-coding-agent container.
   *
   * Produces a minimal providers entry so pi-coding-agent can discover the model.
   * API keys are left empty — the container reads them from environment variables.
   */
  generateModelsJson(input: PiConfigInput): string {
    const modelCfg = input.modelConfig;

    if (!modelCfg?.provider || !modelCfg?.model) {
      // No model config — return empty providers map
      return JSON.stringify({ providers: {} }, null, 2);
    }

    const api = resolvePiModelApi(modelCfg);
    const baseUrl = resolvePiModelBaseUrl(modelCfg, api);
    const apiKeyEnv = resolvePiProviderApiKeyEnv(modelCfg);
    const compat = resolvePiProviderCompat(modelCfg, api);
    const headers = resolvePiProviderHeaders(modelCfg);
    const inlineApiKey = resolvePiProviderInlineApiKey(modelCfg);

    const providerEntry: Record<string, unknown> = {
      api,
      ...((apiKeyEnv ?? inlineApiKey) ? { apiKey: apiKeyEnv ?? inlineApiKey } : {}),
      ...(headers ? { headers } : {}),
      ...(baseUrl ? { baseUrl } : {}),
      ...(compat ? { compat } : {}),
      models: [{ id: modelCfg.model, name: modelCfg.model }],
    };

    return JSON.stringify(
      { providers: { [modelCfg.provider]: providerEntry } },
      null,
      2,
    );
  }

  /**
   * Generate system-prompt.md content for the pi-coding-agent container.
   *
   * Returns only the agent's system prompt. Skills are written as
   * independent files under skills/ and discovered by pi-mono's loadSkills().
   */
  generateSystemPrompt(input: PiConfigInput): string {
    if (input.systemPrompt?.trim()) {
      return input.systemPrompt.trim();
    }

    return '';
  }

  /**
   * Generate skill file maps from structured skill inputs.
   *
   * Each skill becomes a directory containing at least SKILL.md with
   * YAML frontmatter (name + description) followed by the skill body.
   * Additional files from the skill's files map are included as-is.
   *
   * @returns Record<dirName, Record<filename, content>>
   */
  generateSkillFiles(
    input: PiConfigInput,
  ): Record<string, Record<string, string>> {
    const skills = input.skills;
    if (!skills?.length) {
      return {};
    }

    const result: Record<string, Record<string, string>> = {};

    for (const skill of skills) {
      const dirName = this.sanitizeSkillName(skill.name);

      const description = this.escapeYamlString(
        skill.description.length > 1024
          ? skill.description.slice(0, 1024)
          : skill.description,
      );

      const frontmatter = [
        '---',
        `name: ${dirName}`,
        `description: ${description}`,
        '---',
      ].join('\n');

      const skillBody = skill.files['SKILL.md'] ?? '';
      const skillMd = `${frontmatter}\n\n${skillBody}`;

      const files: Record<string, string> = { 'SKILL.md': skillMd };

      for (const [filename, content] of Object.entries(skill.files)) {
        if (filename !== 'SKILL.md') {
          files[filename] = content;
        }
      }

      result[dirName] = files;
    }

    return result;
  }

  /**
   * Generate mcp-servers.json content for the sandbox container.
   *
   * Serializes the MCP server configurations as a JSON object keyed by
   * server name. Each entry follows the Claude Code MCP config format
   * (transportType, command/args/env for stdio, url/headers for HTTP).
   */
  generateMcpServersJson(input: PiConfigInput): string {
    if (!input.mcpServers || Object.keys(input.mcpServers).length === 0) {
      return '{}';
    }

    return JSON.stringify(input.mcpServers, null, 2);
  }

  /**
   * Generate all config files in one call.
   * Returns a bundle ready to mount at /config/ inside the sandbox container.
   */
  generateConfigBundle(input: PiConfigInput): PiConfigBundle {
    return {
      settings: this.generateSettings(input),
      models: this.generateModelsJson(input),
      systemPrompt: this.generateSystemPrompt(input),
      skills: this.generateSkillFiles(input),
      mcpServers: this.generateMcpServersJson(input),
    };
  }

  /**
   * Sanitize a name to kebab-case for pi-mono skill directory naming.
   * Only [a-z0-9-], no leading/trailing -, no --, max 64 chars.
   */
  private sanitizeSkillName(name: string): string {
    let kebab = name
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (kebab.length > 64) {
      kebab = kebab.slice(0, 64).replace(/-+$/, '');
    }

    return kebab || 'unnamed-skill';
  }

  /**
   * Escape a string for safe inclusion as a YAML scalar value.
   * Wraps in double quotes if the value contains YAML-special characters.
   */
  private escapeYamlString(value: string): string {
    if (/[:\n\r#'"{}[\]|>&*!?,]/.test(value)) {
      return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    return value;
  }
}
