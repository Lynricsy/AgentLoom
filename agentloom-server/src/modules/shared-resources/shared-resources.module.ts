import { Module, OnModuleInit } from '@nestjs/common';

import { SandboxModule } from '../sandbox/sandbox.module';
import { SharedResourceRegistry } from './shared-resource-registry';
import { SandboxResourceProvider } from './sandbox-resource.provider';

@Module({
  imports: [SandboxModule],
  providers: [SharedResourceRegistry, SandboxResourceProvider],
  exports: [SharedResourceRegistry, SandboxResourceProvider],
})
export class SharedResourcesModule implements OnModuleInit {
  constructor(
    private readonly registry: SharedResourceRegistry,
    private readonly sandboxResourceProvider: SandboxResourceProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.sandboxResourceProvider);
  }
}
