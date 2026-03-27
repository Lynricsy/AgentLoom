import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  SharedResourceRegistry,
  type SharedResourceProvider,
} from '../shared-resource-registry';

function createMockProvider(type: string): SharedResourceProvider<
  unknown,
  unknown
> & {
  create: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  share: ReturnType<typeof vi.fn>;
} {
  return {
    type,
    create: vi.fn(),
    destroy: vi.fn(),
    share: vi.fn(),
  };
}

describe('SharedResourceRegistry', () => {
  let registry: SharedResourceRegistry;

  beforeEach(() => {
    registry = new SharedResourceRegistry();
  });

  describe('register', () => {
    it('should register a provider successfully', () => {
      const provider = createMockProvider('test');

      expect(() => registry.register(provider)).not.toThrow();
      expect(registry.getProvider('test')).toBe(provider);
    });

    it('should throw on duplicate type registration', () => {
      const provider1 = createMockProvider('sandbox');
      const provider2 = createMockProvider('sandbox');

      registry.register(provider1);

      expect(() => registry.register(provider2)).toThrow(
        'SharedResourceProvider for type "sandbox" is already registered',
      );
    });

    it('should allow registering different types', () => {
      const sandboxProvider = createMockProvider('sandbox');
      const memoryProvider = createMockProvider('memory');

      registry.register(sandboxProvider);
      registry.register(memoryProvider);

      expect(registry.getProvider('sandbox')).toBe(sandboxProvider);
      expect(registry.getProvider('memory')).toBe(memoryProvider);
    });
  });

  describe('getProvider', () => {
    it('should return undefined for unknown type', () => {
      expect(registry.getProvider('nonexistent')).toBeUndefined();
    });

    it('should return registered provider', () => {
      const provider = createMockProvider('test');
      registry.register(provider);

      expect(registry.getProvider('test')).toBe(provider);
    });
  });

  describe('createResource', () => {
    it('should delegate to the correct provider', async () => {
      const provider = createMockProvider('test');
      const config = { foo: 'bar' };
      const instance = { id: '123' };
      provider.create.mockResolvedValue(instance);

      registry.register(provider);
      const result = await registry.createResource('test', config);

      expect(provider.create).toHaveBeenCalledWith(config);
      expect(result).toBe(instance);
    });

    it('should throw for unregistered type', async () => {
      await expect(registry.createResource('unknown', {})).rejects.toThrow(
        'No SharedResourceProvider registered for type "unknown"',
      );
    });
  });

  describe('shareResource', () => {
    it('should delegate to the correct provider', async () => {
      const provider = createMockProvider('test');
      provider.share.mockResolvedValue(undefined);
      const instance = { id: '123' };

      registry.register(provider);
      await registry.shareResource('test', instance, 'consumer-1');

      expect(provider.share).toHaveBeenCalledWith(instance, 'consumer-1');
    });

    it('should throw for unregistered type', async () => {
      await expect(
        registry.shareResource('unknown', {}, 'consumer-1'),
      ).rejects.toThrow(
        'No SharedResourceProvider registered for type "unknown"',
      );
    });
  });
});
