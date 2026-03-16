import { describe, expect, it } from 'vitest';

import { validateManifest } from './validate-manifest';

const validManifest = {
  id: 'com.example.valid-manifest',
  name: 'Valid Manifest',
  version: '1.2.3',
  author: 'AgentLoom',
  description: 'Manifest validation fixture',
  license: 'MIT',
  minPlatformVersion: '0.1.0',
  permissions: ['network:outbound'],
};

describe('validateManifest', () => {
  it('returns a success result for valid manifests', () => {
    expect(validateManifest(validManifest)).toEqual({ valid: true, errors: [] });
  });

  it('returns field-specific errors for invalid manifests', () => {
    const result = validateManifest({
      ...validManifest,
      minPlatformVersion: 'invalid-version',
      permissions: ['network.read'],
    });

    expect(result.valid).toBe(false);

    if (!result.valid) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('minPlatformVersion'),
          expect.stringContaining('permissions.0'),
        ]),
      );
    }
  });

  it('rejects invalid wasmEntry suffixes', () => {
    const result = validateManifest({
      ...validManifest,
      wasmEntry: 'dist/plugin.js',
    });

    expect(result.valid).toBe(false);

    if (!result.valid) {
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('wasmEntry')]),
      );
    }
  });
});
