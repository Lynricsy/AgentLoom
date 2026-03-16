import { describe, expect, it } from 'vitest';

import { validateManifest } from './manifest';

const validManifest = {
  id: 'com.agentloom.review-fixture',
  name: 'Review Fixture',
  version: '1.0.0',
  author: 'AgentLoom Team',
  description: 'Fixture used in manifest tests',
  license: 'MIT',
  minPlatformVersion: '0.1.0',
  permissions: ['network:outbound'],
  extraField: 'should be stripped',
};

describe('validateManifest', () => {
  it('returns the parsed SDK manifest and strips unknown fields', () => {
    const manifest = validateManifest(validManifest);

    expect(manifest).toMatchObject({
      id: 'com.agentloom.review-fixture',
      minPlatformVersion: '0.1.0',
      permissions: ['network:outbound'],
    });
    expect(manifest).not.toHaveProperty('extraField');
  });

  it('throws when minPlatformVersion is missing', () => {
    expect(() =>
      validateManifest({
        ...validManifest,
        minPlatformVersion: undefined,
      }),
    ).toThrow(/minPlatformVersion/);
  });

  it('throws when permissions contain values outside the SDK enum', () => {
    expect(() =>
      validateManifest({
        ...validManifest,
        permissions: ['network.read'],
      }),
    ).toThrow(/permissions\.0/);
  });
});
