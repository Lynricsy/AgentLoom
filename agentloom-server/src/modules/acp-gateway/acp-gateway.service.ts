import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { IAgentRuntime } from '../agent/ports/agent-runtime.port';
import { AcpMessageRouter } from './acp-message-router';
import type { AcpConnectionState } from './acp-types';
import { resolveAcpAgentRuntime } from './resolve-acp-agent-runtime';

@Injectable()
export class AcpGatewayService {
  private agentRuntime?: IAgentRuntime;

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly acpMessageRouter: AcpMessageRouter,
  ) {}

  private getAgentRuntime(): IAgentRuntime {
    if (!this.agentRuntime) {
      this.agentRuntime = resolveAcpAgentRuntime(this.moduleRef);
    }

    return this.agentRuntime;
  }

  handleMessage(rawMessage: string, state: AcpConnectionState) {
    this.getAgentRuntime();
    return this.acpMessageRouter.routeMessage(rawMessage, state);
  }
}
