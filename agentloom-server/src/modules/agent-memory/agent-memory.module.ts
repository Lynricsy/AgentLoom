import { Module, type OnModuleInit } from '@nestjs/common';

import { SharedResourcesModule } from '../shared-resources/shared-resources.module';
import { SharedResourceRegistry } from '../shared-resources/shared-resource-registry';
import { EvidenceModule } from '../evidence/evidence.module';
import { MemoryNodeService } from './services/memory-node.service';
import { MemoryEdgeService } from './services/memory-edge.service';
import { MemoryVersionService } from './services/memory-version.service';
import { PathResolverService } from './services/path-resolver.service';
import { GlossaryService } from './services/glossary.service';
import { MemorySearchService } from './services/memory-search.service';
import { BootProtocolService } from './services/boot-protocol.service';
import { MemoryFusionService } from './services/memory-fusion.service';
import { MemoryToolsService } from './memory-tools.service';
import { MemoryResourceProvider } from './memory-resource.provider';
import { AgentMemoryController } from './agent-memory.controller';
import { MemoryGateway } from './memory.gateway';

@Module({
  imports: [SharedResourcesModule, EvidenceModule],
  controllers: [AgentMemoryController],
  providers: [
    // Core graph services
    MemoryNodeService,
    MemoryEdgeService,
    MemoryVersionService,
    PathResolverService,

    // Higher-level services
    GlossaryService,
    MemorySearchService,
    BootProtocolService,
    MemoryFusionService,

    // Module-level providers
    MemoryToolsService,
    MemoryResourceProvider,

    // Socket.IO gateway
    MemoryGateway,
  ],
  exports: [
    // Services needed by other modules (execution, agent-execution)
    MemoryToolsService,
    MemoryFusionService,
    BootProtocolService,
    MemoryResourceProvider,
  ],
})
export class AgentMemoryModule implements OnModuleInit {
  constructor(
    // Injected for verification that SharedResourcesModule registered the provider
    private readonly registry: SharedResourceRegistry,
    private readonly memoryProvider: MemoryResourceProvider,
  ) {}

  onModuleInit() {
    // MemoryResourceProvider is already registered by SharedResourcesModule.onModuleInit().
    // SharedResourceRegistry.register() throws on duplicate — do NOT re-register here.
    // Verify that the provider is accessible (DI smoke-check).
    const registered = this.registry.getProvider(this.memoryProvider.type);
    if (!registered) {
      // This would indicate a module initialization order problem.
      throw new Error(
        `AgentMemoryModule: MemoryResourceProvider ('${this.memoryProvider.type}') not found in SharedResourceRegistry. Ensure SharedResourcesModule is initialized first.`,
      );
    }
  }
}
