import type { OnModuleInit } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DrizzleDB } from '../../../database/database.module';
import type { SandboxService } from '../../sandbox/sandbox.service';
import { MemoryResourceProvider } from '../../agent-memory/memory-resource.provider';
import { SharedResourceRegistry } from '../shared-resource-registry';
import {
  SANDBOX_RESOURCE_TYPE,
  SandboxResourceProvider,
} from '../sandbox-resource.provider';
import { SharedResourcesModule } from '../shared-resources.module';

const createMockSandboxService = vi.hoisted(() => {
  return () => ({
    createSandboxSession: vi.fn(),
    destroySandbox: vi.fn(),
    destroyConversationSandbox: vi.fn(),
    findByExecutionId: vi.fn(),
    findByConversationId: vi.fn(),
  });
});

describe('SharedResourcesModule', () => {
  let registry: SharedResourceRegistry;
  let sandboxResourceProvider: SandboxResourceProvider;
  let memoryResourceProvider: MemoryResourceProvider;
  let module: SharedResourcesModule;

  beforeEach(() => {
    registry = new SharedResourceRegistry();
    sandboxResourceProvider = new SandboxResourceProvider(
      createMockSandboxService() as unknown as SandboxService,
    );
    memoryResourceProvider = new MemoryResourceProvider(
      {} as unknown as DrizzleDB,
    );
    module = new SharedResourcesModule(
      registry,
      sandboxResourceProvider,
      memoryResourceProvider,
    );
  });

  it('should implement OnModuleInit', () => {
    const lifecycle: OnModuleInit = module;

    expect(typeof lifecycle.onModuleInit).toBe('function');
  });

  it('should register sandbox and memory providers on module init', () => {
    const registerSpy = vi.spyOn(registry, 'register');

    module.onModuleInit();

    expect(registerSpy).toHaveBeenCalledWith(sandboxResourceProvider);
    expect(registerSpy).toHaveBeenCalledWith(memoryResourceProvider);
  });

  it('should expose sandbox and memory providers from registry after module init', () => {
    module.onModuleInit();

    expect(registry.getProvider(SANDBOX_RESOURCE_TYPE)).toBe(sandboxResourceProvider);
    expect(registry.getProvider('memory')).toBe(memoryResourceProvider);
  });

  it('should not throw when onModuleInit is called once', () => {
    expect(() => module.onModuleInit()).not.toThrow();
  });
});
