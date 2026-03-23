import { describe, it, expect, beforeEach } from 'vitest';
import {
  PiConfigGeneratorService,
  type PiModelConfig,
  type PiConfigInput,
} from '../pi-config-generator.service';

describe('PiConfigGeneratorService', () => {
  let service: PiConfigGeneratorService;

  beforeEach(() => {
    service = new PiConfigGeneratorService();
  });

  describe('generateSettings()', () => {
    it('returns valid JSON with compaction and retry defaults when no modelConfig', () => {
      const result = service.generateSettings({});
      const parsed = JSON.parse(result) as Record<string, unknown>;

      expect(parsed).toMatchObject({
        compaction: { enabled: true },
        retry: { enabled: true, maxRetries: 3, baseDelayMs: 2000 },
      });
      expect(parsed).not.toHaveProperty('defaultProvider');
      expect(parsed).not.toHaveProperty('defaultModel');
    });

    it('includes defaultProvider and defaultModel when modelConfig is set', () => {
      const input: PiConfigInput = {
        modelConfig: { provider: 'anthropic', model: 'claude-3-7-sonnet' },
      };
      const parsed = JSON.parse(service.generateSettings(input)) as Record<string, unknown>;

      expect(parsed.defaultProvider).toBe('anthropic');
      expect(parsed.defaultModel).toBe('claude-3-7-sonnet');
    });

    it('includes defaultThinkingLevel when provided', () => {
      const input: PiConfigInput = {
        modelConfig: { provider: 'anthropic', model: 'claude-3-7-sonnet', thinkingLevel: 'high' },
      };
      const parsed = JSON.parse(service.generateSettings(input)) as Record<string, unknown>;

      expect(parsed.defaultThinkingLevel).toBe('high');
    });

    it('omits thinkingLevel key when not provided', () => {
      const input: PiConfigInput = {
        modelConfig: { provider: 'openai', model: 'gpt-4o' },
      };
      const parsed = JSON.parse(service.generateSettings(input)) as Record<string, unknown>;

      expect(parsed).not.toHaveProperty('defaultThinkingLevel');
    });

    it('handles null modelConfig gracefully', () => {
      const result = service.generateSettings({ modelConfig: null });
      const parsed = JSON.parse(result) as Record<string, unknown>;

      expect(parsed).not.toHaveProperty('defaultProvider');
    });
  });

  describe('generateModelsJson()', () => {
    it('returns empty providers map when no modelConfig', () => {
      const result = service.generateModelsJson({});
      const parsed = JSON.parse(result) as { providers: Record<string, unknown> };

      expect(parsed).toEqual({ providers: {} });
    });

    it('maps anthropic provider to anthropic-messages api', () => {
      const cfg: PiModelConfig = { provider: 'anthropic', model: 'claude-3-7-sonnet' };
      const parsed = JSON.parse(
        service.generateModelsJson({ modelConfig: cfg }),
      ) as { providers: Record<string, { api: string; models: { id: string }[] }> };

      expect(parsed.providers['anthropic'].api).toBe('anthropic-messages');
      expect(parsed.providers['anthropic'].models[0].id).toBe('claude-3-7-sonnet');
    });

    it('maps openai provider to openai-completions api', () => {
      const cfg: PiModelConfig = { provider: 'openai', model: 'gpt-4o' };
      const parsed = JSON.parse(
        service.generateModelsJson({ modelConfig: cfg }),
      ) as { providers: Record<string, { api: string }> };

      expect(parsed.providers['openai'].api).toBe('openai-completions');
    });

    it('maps openrouter provider to openai-completions api', () => {
      const cfg: PiModelConfig = { provider: 'openrouter', model: 'some/model' };
      const parsed = JSON.parse(
        service.generateModelsJson({ modelConfig: cfg }),
      ) as { providers: Record<string, { api: string; baseUrl: string }> };

      expect(parsed.providers['openrouter'].api).toBe('openai-completions');
      expect(parsed.providers['openrouter'].baseUrl).toBe('https://openrouter.ai/api/v1');
    });

    it('falls back to <provider>-completions for unknown provider', () => {
      const cfg: PiModelConfig = { provider: 'custom-llm', model: 'my-model' };
      const parsed = JSON.parse(
        service.generateModelsJson({ modelConfig: cfg }),
      ) as { providers: Record<string, { api: string }> };

      expect(parsed.providers['custom-llm'].api).toBe('custom-llm-completions');
    });

    it('uses custom apiBaseUrl when provided, overriding the default', () => {
      const cfg: PiModelConfig = {
        provider: 'openai',
        model: 'gpt-4o',
        apiBaseUrl: 'https://my-proxy.example.com/v1',
      };
      const parsed = JSON.parse(
        service.generateModelsJson({ modelConfig: cfg }),
      ) as { providers: Record<string, { baseUrl: string }> };

      expect(parsed.providers['openai'].baseUrl).toBe('https://my-proxy.example.com/v1');
    });

    it('does NOT include apiKey in generated models.json', () => {
      const cfg: PiModelConfig = { provider: 'anthropic', model: 'claude-3-7-sonnet' };
      const json = service.generateModelsJson({ modelConfig: cfg });

      expect(json).not.toContain('apiKey');
      expect(json).not.toContain('api_key');
    });

    it('includes baseUrl for known providers with default URL', () => {
      const cfg: PiModelConfig = { provider: 'groq', model: 'llama-3' };
      const parsed = JSON.parse(
        service.generateModelsJson({ modelConfig: cfg }),
      ) as { providers: Record<string, { baseUrl: string }> };

      expect(parsed.providers['groq'].baseUrl).toBe('https://api.groq.com/openai/v1');
    });

    it('bedrock provider maps to bedrock-converse-stream without baseUrl', () => {
      const cfg: PiModelConfig = { provider: 'bedrock', model: 'anthropic.claude-3' };
      const parsed = JSON.parse(
        service.generateModelsJson({ modelConfig: cfg }),
      ) as { providers: Record<string, { api: string; baseUrl?: string }> };

      expect(parsed.providers['bedrock'].api).toBe('bedrock-converse-stream');
      expect(parsed.providers['bedrock'].baseUrl).toBeUndefined();
    });
  });

  describe('generateSystemPrompt()', () => {
    it('returns empty string when no systemPrompt or skillContent', () => {
      expect(service.generateSystemPrompt({})).toBe('');
    });

    it('returns only systemPrompt when skillContent is absent', () => {
      const result = service.generateSystemPrompt({ systemPrompt: 'You are helpful.' });
      expect(result).toBe('You are helpful.');
    });

    it('returns only skillContent when systemPrompt is absent', () => {
      const result = service.generateSystemPrompt({
        skillContent: '<available_skills>...</available_skills>',
      });
      expect(result).toBe('<available_skills>...</available_skills>');
    });

    it('joins systemPrompt and skillContent with double newline', () => {
      const result = service.generateSystemPrompt({
        systemPrompt: 'You are a coding assistant.',
        skillContent: '<available_skills>code-review</available_skills>',
      });
      expect(result).toBe(
        'You are a coding assistant.\n\n<available_skills>code-review</available_skills>',
      );
    });

    it('trims whitespace from systemPrompt and skillContent', () => {
      const result = service.generateSystemPrompt({
        systemPrompt: '  trimmed  ',
        skillContent: '  also trimmed  ',
      });
      expect(result).toBe('trimmed\n\nalso trimmed');
    });

    it('returns empty string for whitespace-only inputs', () => {
      expect(service.generateSystemPrompt({ systemPrompt: '   ', skillContent: '\n  ' })).toBe('');
    });
  });

  describe('generateConfigBundle()', () => {
    it('returns an object with settings, models, and systemPrompt fields', () => {
      const input: PiConfigInput = {
        systemPrompt: 'You are a bot.',
        modelConfig: { provider: 'openai', model: 'gpt-4o' },
        skillContent: '<available_skills/>',
      };
      const bundle = service.generateConfigBundle(input);

      expect(typeof bundle.settings).toBe('string');
      expect(typeof bundle.models).toBe('string');
      expect(typeof bundle.systemPrompt).toBe('string');
    });

    it('bundle.settings and bundle.models are valid JSON', () => {
      const bundle = service.generateConfigBundle({
        modelConfig: { provider: 'anthropic', model: 'claude-3-7-sonnet' },
      });

      expect(() => JSON.parse(bundle.settings)).not.toThrow();
      expect(() => JSON.parse(bundle.models)).not.toThrow();
    });

    it('bundle values are consistent with individual method outputs', () => {
      const input: PiConfigInput = {
        systemPrompt: 'Act as an expert.',
        modelConfig: { provider: 'google', model: 'gemini-2.0-flash' },
      };
      const bundle = service.generateConfigBundle(input);

      expect(bundle.settings).toBe(service.generateSettings(input));
      expect(bundle.models).toBe(service.generateModelsJson(input));
      expect(bundle.systemPrompt).toBe(service.generateSystemPrompt(input));
    });
  });
});
