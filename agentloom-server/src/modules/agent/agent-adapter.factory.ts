import { Injectable } from '@nestjs/common';

import { InProcessAgentAdapter } from './in-process-agent.adapter';
import type { IAgentRuntime } from './ports/agent-runtime.port';
import { SandboxAgentAdapter } from './sandbox-agent.adapter';

export const AGENT_RUNTIME_FACTORY = Symbol('AGENT_RUNTIME_FACTORY');

export interface IAgentAdapterFactory {
  selectAdapter(hasSandbox: boolean): IAgentRuntime;
}

@Injectable()
export class AgentAdapterFactory implements IAgentAdapterFactory {
  constructor(
    private readonly inProcessAdapter: InProcessAgentAdapter,
    private readonly sandboxAdapter: SandboxAgentAdapter,
  ) {}

  selectAdapter(hasSandbox: boolean): IAgentRuntime {
    return hasSandbox ? this.sandboxAdapter : this.inProcessAdapter;
  }
}
