import { describe, expect, it } from 'vitest';

import { PluginManifestSchema, ReverseDomainPluginIdSchema, SemverStringSchema } from './manifest-schema';

const validManifest = {
  id: 'com.example.plugin',
  name: 'Example Plugin',
  version: '1.2.3',
  author: 'AgentLoom',
  description: 'Example plugin for tests.',
  license: 'MIT',
  minPlatformVersion: '0.1.0',
  permissions: ['network:outbound', 'llm:invoke'],
};

describe('PluginManifestSchema', () => {
  it('valid manifest passes', () => {
    const result = PluginManifestSchema.safeParse(validManifest);

    expect(result.success).toBe(true);
  });

  it('missing required fields fail', () => {
    const result = PluginManifestSchema.safeParse({});

    expect(result.success).toBe(false);

    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path[0]);

      expect(paths).toEqual(
        expect.arrayContaining([
          'id',
          'name',
          'version',
          'author',
          'description',
          'license',
          'minPlatformVersion',
          'permissions',
        ]),
      );
    }
  });

  it('invalid permission values fail', () => {
    const result = PluginManifestSchema.safeParse({
      ...validManifest,
      permissions: ['network:outbound', 'bad:permission'],
    });

    expect(result.success).toBe(false);
  });

  it('unknown fields are stripped instead of rejected', () => {
    const parsed = PluginManifestSchema.parse({
      ...validManifest,
      extraField: 'should be stripped',
    });

    expect(parsed).not.toHaveProperty('extraField');
    expect(parsed).toMatchObject(validManifest);
  });

  it('optional fields work correctly', () => {
    const result = PluginManifestSchema.safeParse({
      ...validManifest,
      keywords: ['plugin', 'sdk'],
      icon: 'icon.svg',
      homepage: 'https://agentloom.dev',
      repository: 'https://github.com/agentloom/plugin',
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data).toMatchObject({
        keywords: ['plugin', 'sdk'],
        icon: 'icon.svg',
        homepage: 'https://agentloom.dev',
        repository: 'https://github.com/agentloom/plugin',
      });
    }
  });
});

describe('ReverseDomainPluginIdSchema', () => {
  it('invalid reverse-domain ids fail', () => {
    const invalidIds = ['bad', 'Bad.Example', '123.abc'];

    for (const id of invalidIds) {
      expect(ReverseDomainPluginIdSchema.safeParse(id).success).toBe(false);
    }
  });

  it('valid reverse-domain ids pass', () => {
    const validIds = ['com.example.plugin', 'io.agentloom.my-plugin'];

    for (const id of validIds) {
      expect(ReverseDomainPluginIdSchema.safeParse(id).success).toBe(true);
    }
  });
});

describe('SemverStringSchema', () => {
  it('invalid semver versions fail', () => {
    expect(SemverStringSchema.safeParse('version-one').success).toBe(false);
  });
});
