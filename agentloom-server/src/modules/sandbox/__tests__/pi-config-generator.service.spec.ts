import { describe, it, expect, beforeEach } from 'vitest';
import {
  PiConfigGeneratorService,
  type PiModelConfig,
  type PiConfigInput,
  type SkillInput,
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
      const parsed = JSON.parse(service.generateSettings(input)) as Record<
        string,
        unknown
      >;

      expect(parsed.defaultProvider).toBe('anthropic');
      expect(parsed.defaultModel).toBe('claude-3-7-sonnet');
    });

    it('includes defaultThinkingLevel when provided', () => {
      const input: PiConfigInput = {
        modelConfig: {
          provider: 'anthropic',
          model: 'claude-3-7-sonnet',
          thinkingLevel: 'high',
        },
      };
      const parsed = JSON.parse(service.generateSettings(input)) as Record<
        string,
        unknown
      >;

      expect(parsed.defaultThinkingLevel).toBe('high');
    });

    it('omits thinkingLevel key when not provided', () => {
      const input: PiConfigInput = {
        modelConfig: { provider: 'openai', model: 'gpt-4o' },
      };
      const parsed = JSON.parse(service.generateSettings(input)) as Record<
        string,
        unknown
      >;

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
      const parsed = JSON.parse(result) as {
        providers: Record<string, unknown>;
      };

      expect(parsed).toEqual({ providers: {} });
    });

    it('maps anthropic provider to anthropic-messages api', () => {
      const cfg: PiModelConfig = {
        provider: 'anthropic',
        model: 'claude-3-7-sonnet',
      };
      const parsed = JSON.parse(
        service.generateModelsJson({ modelConfig: cfg }),
      ) as {
        providers: Record<string, { api: string; models: { id: string }[] }>;
      };

      expect(parsed.providers['anthropic'].api).toBe('anthropic-messages');
      expect(parsed.providers['anthropic'].models[0].id).toBe(
        'claude-3-7-sonnet',
      );
    });

    it('maps openai provider to openai-completions api', () => {
      const cfg: PiModelConfig = { provider: 'openai', model: 'gpt-4o' };
      const parsed = JSON.parse(
        service.generateModelsJson({ modelConfig: cfg }),
      ) as { providers: Record<string, { api: string }> };

      expect(parsed.providers['openai'].api).toBe('openai-completions');
    });

    it('maps private_cloud provider to openai-completions api with private env key', () => {
      const cfg: PiModelConfig = {
        provider: 'private_cloud',
        model: 'claude-opus-4-6',
        apiBaseUrl: 'https://models.example.test/v1',
        authMethod: 'api_key',
      };
      const parsed = JSON.parse(
        service.generateModelsJson({ modelConfig: cfg }),
      ) as {
        providers: Record<
          string,
          {
            api: string;
            apiKey: string;
            baseUrl: string;
            compat: Record<string, unknown>;
          }
        >;
      };

      expect(parsed.providers['private_cloud'].api).toBe('openai-completions');
      expect(parsed.providers['private_cloud'].apiKey).toBe(
        'PRIVATE_CLOUD_API_KEY',
      );
      expect(parsed.providers['private_cloud'].baseUrl).toBe(
        'https://models.example.test/v1',
      );
      expect(parsed.providers['private_cloud'].compat).toMatchObject({
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
        maxTokensField: 'max_tokens',
      });
    });

    it('private_cloud 非 api_key 鉴权时不应写入 apiKey 字段', () => {
      const cfg: PiModelConfig = {
        provider: 'private_cloud',
        model: 'claude-opus-4-6',
        apiBaseUrl: 'https://models.example.test/v1',
        authMethod: 'none',
      };
      const parsed = JSON.parse(
        service.generateModelsJson({ modelConfig: cfg }),
      ) as { providers: Record<string, Record<string, unknown>> };

      expect(parsed.providers['private_cloud']).not.toHaveProperty('apiKey');
    });

    it('maps openrouter provider to openai-completions api', () => {
      const cfg: PiModelConfig = {
        provider: 'openrouter',
        model: 'some/model',
      };
      const parsed = JSON.parse(
        service.generateModelsJson({ modelConfig: cfg }),
      ) as { providers: Record<string, { api: string; baseUrl: string }> };

      expect(parsed.providers['openrouter'].api).toBe('openai-completions');
      expect(parsed.providers['openrouter'].baseUrl).toBe(
        'https://openrouter.ai/api/v1',
      );
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

      expect(parsed.providers['openai'].baseUrl).toBe(
        'https://my-proxy.example.com/v1',
      );
    });

    it('includes apiKey env var name (not raw secret) in generated models.json', () => {
      const cfg: PiModelConfig = {
        provider: 'anthropic',
        model: 'claude-3-7-sonnet',
      };
      const parsed = JSON.parse(
        service.generateModelsJson({ modelConfig: cfg }),
      ) as { providers: Record<string, { apiKey: string }> };

      // apiKey is an env var name reference, resolved by pi-mono's resolveConfigValue()
      expect(parsed.providers['anthropic'].apiKey).toBe('ANTHROPIC_API_KEY');
    });

    it('includes baseUrl for known providers with default URL', () => {
      const cfg: PiModelConfig = { provider: 'groq', model: 'llama-3' };
      const parsed = JSON.parse(
        service.generateModelsJson({ modelConfig: cfg }),
      ) as { providers: Record<string, { baseUrl: string }> };

      expect(parsed.providers['groq'].baseUrl).toBe(
        'https://api.groq.com/openai/v1',
      );
    });

    it('bedrock provider maps to bedrock-converse-stream with default baseUrl', () => {
      const cfg: PiModelConfig = {
        provider: 'bedrock',
        model: 'anthropic.claude-3',
      };
      const parsed = JSON.parse(
        service.generateModelsJson({ modelConfig: cfg }),
      ) as { providers: Record<string, { api: string; baseUrl?: string }> };

      expect(parsed.providers['bedrock'].api).toBe('bedrock-converse-stream');
      expect(parsed.providers['bedrock'].baseUrl).toBe(
        'https://bedrock-runtime.us-east-1.amazonaws.com',
      );
    });
  });

  describe('generateSystemPrompt()', () => {
    it('returns empty string when no systemPrompt', () => {
      expect(service.generateSystemPrompt({})).toBe('');
    });

    it('returns trimmed systemPrompt', () => {
      const result = service.generateSystemPrompt({
        systemPrompt: '  You are helpful.  ',
      });
      expect(result).toBe('You are helpful.');
    });

    it('returns empty string for whitespace-only systemPrompt', () => {
      expect(service.generateSystemPrompt({ systemPrompt: '   ' })).toBe('');
    });

    it('does not include skill content in system prompt', () => {
      const result = service.generateSystemPrompt({
        systemPrompt: 'You are a coding assistant.',
        skills: [
          {
            name: 'code-review',
            description: 'Reviews code',
            files: { 'SKILL.md': 'review code' },
          },
        ],
      });
      expect(result).toBe('You are a coding assistant.');
      expect(result).not.toContain('code-review');
      expect(result).not.toContain('review code');
    });

    it('handles null systemPrompt gracefully', () => {
      expect(service.generateSystemPrompt({ systemPrompt: null })).toBe('');
    });
  });

  describe('generateSkillFiles()', () => {
    it('returns empty object when no skills', () => {
      expect(service.generateSkillFiles({})).toEqual({});
    });

    it('returns empty object for empty skills array', () => {
      expect(service.generateSkillFiles({ skills: [] })).toEqual({});
    });

    it('generates SKILL.md with valid YAML frontmatter', () => {
      const skills: SkillInput[] = [
        {
          name: 'Code Review',
          description: 'Reviews code for quality',
          files: { 'SKILL.md': 'Review the code carefully.' },
        },
      ];
      const result = service.generateSkillFiles({ skills });

      expect(result).toHaveProperty('code-review');
      const skillMd = result['code-review']['SKILL.md'];
      expect(skillMd).toContain('---');
      expect(skillMd).toContain('name: code-review');
      expect(skillMd).toContain('description: Reviews code for quality');
      expect(skillMd).toContain('Review the code carefully.');
    });

    it('sanitizes name to kebab-case', () => {
      const skills: SkillInput[] = [
        {
          name: 'My  AWESOME  Skill!!!',
          description: 'A skill',
          files: { 'SKILL.md': 'content' },
        },
      ];
      const result = service.generateSkillFiles({ skills });

      const dirNames = Object.keys(result);
      expect(dirNames).toHaveLength(1);
      // Only [a-z0-9-], no consecutive --, no leading/trailing -
      expect(dirNames[0]).toMatch(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
      expect(dirNames[0]).not.toContain('--');
    });

    it('truncates name to max 64 characters', () => {
      const longName = 'a'.repeat(100);
      const skills: SkillInput[] = [
        { name: longName, description: 'desc', files: { 'SKILL.md': 'body' } },
      ];
      const result = service.generateSkillFiles({ skills });

      const dirName = Object.keys(result)[0];
      expect(dirName.length).toBeLessThanOrEqual(64);
    });

    it('includes additional files from skill files map', () => {
      const skills: SkillInput[] = [
        {
          name: 'multi-file-skill',
          description: 'Has extra files',
          files: {
            'SKILL.md': 'Main content',
            'helper.md': 'Helper content',
            'examples.ts': 'const x = 1;',
          },
        },
      ];
      const result = service.generateSkillFiles({ skills });

      expect(result['multi-file-skill']).toHaveProperty('SKILL.md');
      expect(result['multi-file-skill']).toHaveProperty('helper.md');
      expect(result['multi-file-skill']['helper.md']).toBe('Helper content');
      expect(result['multi-file-skill']).toHaveProperty('examples.ts');
      expect(result['multi-file-skill']['examples.ts']).toBe('const x = 1;');
    });

    it('handles multiple skills', () => {
      const skills: SkillInput[] = [
        { name: 'skill-a', description: 'First', files: { 'SKILL.md': 'A' } },
        { name: 'skill-b', description: 'Second', files: { 'SKILL.md': 'B' } },
      ];
      const result = service.generateSkillFiles({ skills });

      expect(Object.keys(result)).toHaveLength(2);
      expect(result).toHaveProperty('skill-a');
      expect(result).toHaveProperty('skill-b');
    });

    it('escapes YAML-special characters in description', () => {
      const skills: SkillInput[] = [
        {
          name: 'yaml-test',
          description: 'Has: colons and "quotes"',
          files: { 'SKILL.md': 'body' },
        },
      ];
      const result = service.generateSkillFiles({ skills });

      const skillMd = result['yaml-test']['SKILL.md'];
      // Description with special chars should be quoted
      expect(skillMd).toContain('description: "Has: colons and \\"quotes\\""');
    });

    it('uses fallback name for empty skill name', () => {
      const skills: SkillInput[] = [
        { name: '!!!', description: 'desc', files: { 'SKILL.md': 'body' } },
      ];
      const result = service.generateSkillFiles({ skills });

      expect(result).toHaveProperty('unnamed-skill');
    });

    it('uses empty body when SKILL.md is missing from files', () => {
      const skills: SkillInput[] = [
        { name: 'no-body', description: 'No SKILL.md', files: {} },
      ];
      const result = service.generateSkillFiles({ skills });

      const skillMd = result['no-body']['SKILL.md'];
      expect(skillMd).toContain('---');
      expect(skillMd).toContain('name: no-body');
      // Body should be empty after frontmatter
      expect(skillMd).toMatch(/---\n\n$/);
    });
  });

  describe('generateConfigBundle()', () => {
    it('returns an object with settings, models, systemPrompt, and skills fields', () => {
      const input: PiConfigInput = {
        systemPrompt: 'You are a bot.',
        modelConfig: { provider: 'openai', model: 'gpt-4o' },
        skills: [
          {
            name: 'test-skill',
            description: 'A test',
            files: { 'SKILL.md': 'content' },
          },
        ],
      };
      const bundle = service.generateConfigBundle(input);

      expect(typeof bundle.settings).toBe('string');
      expect(typeof bundle.models).toBe('string');
      expect(typeof bundle.systemPrompt).toBe('string');
      expect(typeof bundle.skills).toBe('object');
    });

    it('bundle.settings and bundle.models are valid JSON', () => {
      const bundle = service.generateConfigBundle({
        modelConfig: { provider: 'anthropic', model: 'claude-3-7-sonnet' },
      });

      expect(() => JSON.parse(bundle.settings) as unknown).not.toThrow();
      expect(() => JSON.parse(bundle.models) as unknown).not.toThrow();
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
      expect(bundle.skills).toEqual(service.generateSkillFiles(input));
    });

    it('bundle.skills contains generated skill directories', () => {
      const input: PiConfigInput = {
        systemPrompt: 'Prompt',
        skills: [
          {
            name: 'my-skill',
            description: 'Skill desc',
            files: { 'SKILL.md': 'Skill body' },
          },
        ],
      };
      const bundle = service.generateConfigBundle(input);

      expect(bundle.skills).toHaveProperty('my-skill');
      expect(bundle.skills['my-skill']['SKILL.md']).toContain('name: my-skill');
    });

    it('bundle.skills is empty when no skills provided', () => {
      const bundle = service.generateConfigBundle({
        systemPrompt: 'No skills here.',
      });

      expect(bundle.skills).toEqual({});
    });

    it('systemPrompt does not contain skill content', () => {
      const input: PiConfigInput = {
        systemPrompt: 'Base prompt.',
        skills: [
          {
            name: 'code-review',
            description: 'Reviews',
            files: { 'SKILL.md': 'Review code' },
          },
        ],
      };
      const bundle = service.generateConfigBundle(input);

      expect(bundle.systemPrompt).toBe('Base prompt.');
      expect(bundle.systemPrompt).not.toContain('code-review');
    });
  });
});
