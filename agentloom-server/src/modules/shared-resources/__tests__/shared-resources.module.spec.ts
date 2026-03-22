import type { OnModuleInit } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SandboxService } from '../../sandbox/sandbox.service';
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
  let module: SharedResourcesModule;

  beforeEach(() => {
    registry = new SharedResourceRegistry();
    sandboxResourceProvider = new SandboxResourceProvider(
      createMockSandboxService() as unknown as SandboxService,
    );
    module = new SharedResourcesModule(registry, sandboxResourceProvider);
  });

  it('should implement OnModuleInit', () => {
    const lifecycle: OnModuleInit = module;

    expect(typeof lifecycle.onModuleInit).toBe('function');
  });

  it('should register sandbox provider on module init', () => {
    const registerSpy = vi.spyOn(registry, 'register');

    module.onModuleInit();

    expect(registerSpy).toHaveBeenCalledWith(sandboxResourceProvider);
  });

  it('should expose sandbox provider from registry after module init', () => {
    module.onModuleInit();

    expect(registry.getProvider(SANDBOX_RESOURCE_TYPE)).toBe(sandboxResourceProvider);
  });

  it('should not throw when onModuleInit is called once', () => {
    expect(() => module.onModuleInit()).not.toThrow();
  });
});
