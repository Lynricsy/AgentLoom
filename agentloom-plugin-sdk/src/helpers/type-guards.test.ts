import { describe, expect, it } from 'vitest';

import { PLUGIN_PERMISSIONS, PORT_DATA_TYPES } from '../types';
import { isPluginManifest, isPortDataType, isValidPermission } from './type-guards';

describe('isPortDataType', () => {
  it('returns true for all valid types', () => {
    for (const value of PORT_DATA_TYPES) {
      expect(isPortDataType(value)).toBe(true);
    }
  });

  it('returns false for invalid values', () => {
    const invalidValues: unknown[] = ['binary', '', null, 123, {}, []];

    for (const value of invalidValues) {
      expect(isPortDataType(value)).toBe(false);
    }
  });
});

describe('isValidPermission', () => {
  it('returns true for all valid permissions', () => {
    for (const value of PLUGIN_PERMISSIONS) {
      expect(isValidPermission(value)).toBe(true);
    }
  });

  it('returns false for invalid values', () => {
    const invalidValues: unknown[] = ['network:inbound', '', null, 123, {}, []];

    for (const value of invalidValues) {
      expect(isValidPermission(value)).toBe(false);
    }
  });
});

describe('isPluginManifest', () => {
  it('validates correctly for a valid manifest', () => {
    expect(
      isPluginManifest({
        id: 'com.example.plugin',
        name: 'Example Plugin',
        version: '1.2.3',
        author: 'AgentLoom',
        description: 'Example plugin for tests.',
        license: 'MIT',
        minPlatformVersion: '0.1.0',
        permissions: ['network:outbound'],
      }),
    ).toBe(true);
  });

  it('validates correctly for an invalid manifest', () => {
    expect(
      isPluginManifest({
        id: 'bad',
        name: 'Broken Plugin',
        version: 'not-semver',
        author: 'AgentLoom',
        description: 'Invalid plugin.',
        license: 'MIT',
        minPlatformVersion: '0.1.0',
        permissions: ['network:outbound'],
      }),
    ).toBe(false);
  });
});
