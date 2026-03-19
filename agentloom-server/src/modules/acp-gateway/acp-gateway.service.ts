import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AGENT_RUNTIME, type IAgentRuntime } from '../agent/ports/agent-runtime.port';
import { AcpMessageRouter } from './acp-message-router';
import type { AcpConnectionState } from './acp-types';

@Injectable()
export class AcpGatewayService {
  private agentRuntime?: IAgentRuntime;

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly acpMessageRouter: AcpMessageRouter,
  ) {}

  private getAgentRuntime(): IAgentRuntime {
    if (!this.agentRuntime) {
      this.agentRuntime = this.moduleRef.get<IAgentRuntime>(AGENT_RUNTIME, {
        strict: false,
      });
    }

    return this.agentRuntime;
  }

  handleMessage(rawMessage: string, state: AcpConnectionState) {
    this.getAgentRuntime();
    return this.acpMessageRouter.routeMessage(rawMessage, state);
  }
}
