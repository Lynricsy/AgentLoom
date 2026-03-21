import { Injectable, Logger } from '@nestjs/common';

import { SandboxService } from '../sandbox/sandbox.service';
import type { SandboxConfig, SandboxSession } from '../../database/schema';
import type { SharedResourceProvider } from './shared-resource-registry';

export const SANDBOX_RESOURCE_TYPE = 'sandbox' as const;

export type SandboxResourceConfig = {
  sandboxNodeId: string | null;
  config: SandboxConfig;
  tenantId: string;
  executionId?: string;
  agentConversationId?: string;
};

export type SandboxResourceInstance = {
  sessionId: string;
  session: SandboxSession;
  tenantId: string;
};

@Injectable()
export class SandboxResourceProvider
  implements SharedResourceProvider<SandboxResourceConfig, SandboxResourceInstance>
{
  private readonly logger = new Logger(SandboxResourceProvider.name);

  readonly type = SANDBOX_RESOURCE_TYPE;

  constructor(private readonly sandboxService: SandboxService) {}

  async create(config: SandboxResourceConfig): Promise<SandboxResourceInstance> {
    const session = await this.sandboxService.createSandboxSession({
      sandboxNodeId: config.sandboxNodeId,
      config: config.config,
      tenantId: config.tenantId,
      executionId: config.executionId,
      agentConversationId: config.agentConversationId,
    });

    this.logger.debug(`Created sandbox resource: session ${session.id}`);

    return {
      sessionId: session.id,
      session,
      tenantId: config.tenantId,
    };
  }

  async destroy(instance: SandboxResourceInstance): Promise<void> {
    const { session, tenantId } = instance;

    if (session.agentConversationId) {
      await this.sandboxService.destroyConversationSandbox(
        session.agentConversationId,
        tenantId,
      );
    } else if (session.executionId) {
      await this.sandboxService.destroySandbox(session.executionId, tenantId);
    }

    this.logger.debug(`Destroyed sandbox resource: session ${instance.sessionId}`);
  }

  async share(
    instance: SandboxResourceInstance,
    consumerId: string,
  ): Promise<void> {
    this.logger.debug(
      `Sharing sandbox session ${instance.sessionId} with consumer ${consumerId}`,
    );
  }
}
