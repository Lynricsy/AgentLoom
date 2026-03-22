import { Module, OnModuleInit } from '@nestjs/common';

import { MemoryResourceProvider } from '../agent-memory/memory-resource.provider';
import { SandboxModule } from '../sandbox/sandbox.module';
import { SharedResourceRegistry } from './shared-resource-registry';
import { SandboxResourceProvider } from './sandbox-resource.provider';

@Module({
  imports: [SandboxModule],
  providers: [
    SharedResourceRegistry,
    SandboxResourceProvider,
    MemoryResourceProvider,
  ],
  exports: [
    SharedResourceRegistry,
    SandboxResourceProvider,
    MemoryResourceProvider,
  ],
})
export class SharedResourcesModule implements OnModuleInit {
  constructor(
    private readonly registry: SharedResourceRegistry,
    private readonly sandboxResourceProvider: SandboxResourceProvider,
    private readonly memoryResourceProvider: MemoryResourceProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.sandboxResourceProvider);
    this.registry.register(this.memoryResourceProvider);
  }
}
