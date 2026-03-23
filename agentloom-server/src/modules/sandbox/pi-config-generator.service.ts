import { Injectable } from '@nestjs/common';

export interface PiModelConfig {
  provider: string;
  model: string;
  thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  apiBaseUrl?: string;
}

export interface PiConfigInput {
  systemPrompt?: string | null;
  modelConfig?: PiModelConfig | null;
  skillContent?: string | null;
}

export interface PiConfigBundle {
  settings: string;
  models: string;
  systemPrompt: string;
}

// Maps AgentLoom provider name → pi-ai API identifier
const PROVIDER_API_MAP: Record<string, string> = {
  anthropic: 'anthropic-messages',
  openai: 'openai-completions',
  google: 'google-generative-ai',
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
  xai: 'https://api.x.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

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

    const api =
      PROVIDER_API_MAP[modelCfg.provider] ??
      `${modelCfg.provider}-completions`;
    const baseUrl =
      modelCfg.apiBaseUrl ??
      PROVIDER_BASE_URL_MAP[modelCfg.provider] ??
      undefined;

    const providerEntry: Record<string, unknown> = {
      api,
      // apiKey intentionally omitted — injected as ANTHROPIC_API_KEY / OPENAI_API_KEY etc.
      models: [{ id: modelCfg.model, name: modelCfg.model }],
    };
    if (baseUrl) {
      providerEntry.baseUrl = baseUrl;
    }

    return JSON.stringify(
      { providers: { [modelCfg.provider]: providerEntry } },
      null,
      2,
    );
  }

  /**
   * Generate system-prompt.md content for the pi-coding-agent container.
   *
   * Combines the agent's system prompt with pre-resolved skill content
   * (from `SkillResolverService.resolveSkillsForAgent()`).
   */
  generateSystemPrompt(input: PiConfigInput): string {
    const parts: string[] = [];

    if (input.systemPrompt?.trim()) {
      parts.push(input.systemPrompt.trim());
    }

    if (input.skillContent?.trim()) {
      // Skill content is already formatted as <available_skills> XML
      parts.push(input.skillContent.trim());
    }

    return parts.join('\n\n');
  }

  /**
   * Generate all three config files in one call.
   * Returns a bundle ready to mount at /config/ inside the sandbox container.
   */
  generateConfigBundle(input: PiConfigInput): PiConfigBundle {
    return {
      settings: this.generateSettings(input),
      models: this.generateModelsJson(input),
      systemPrompt: this.generateSystemPrompt(input),
    };
  }
}
