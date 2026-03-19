import { isAbsolute } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AGENT_RUNTIME, type IAgentRuntime } from '../../agent/ports/agent-runtime.port';
import type { McpServerConfig } from '../../agent/types/agent-session.types';
import { AcpJsonRpcError } from '../acp-jsonrpc';
import type {
  AcpConnectionState,
  AcpSessionNewParams,
  AcpSessionNewResult,
  AcpTrackedSession,
} from '../acp-types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class SessionNewHandler {
  private agentRuntime?: IAgentRuntime;

  constructor(private readonly moduleRef: ModuleRef) {}

  async handle(
    params: unknown,
    state: AcpConnectionState,
  ): Promise<AcpSessionNewResult> {
    const tenantId = state.authContext?.tenantId;
    if (typeof tenantId !== 'string' || tenantId.length === 0) {
      throw new AcpJsonRpcError(-32002, 'Authentication required');
    }

    const normalizedParams = this.readParams(params);
    const session = await this.getAgentRuntime().createSession({
      agentId: normalizedParams.agentId,
      mode: 'conversation',
      tenantId,
      ...(normalizedParams.cwd === undefined
        ? {}
        : { cwd: normalizedParams.cwd }),
      ...(normalizedParams.mcpServers === undefined
        ? {}
        : { mcpServers: normalizedParams.mcpServers }),
    });

    const sessions = state.sessions ?? new Map<string, AcpTrackedSession>();
    state.sessions = sessions;
    sessions.set(session.id, {
      sessionId: session.id,
      runtimeSessionId: session.id,
      agentId: session.agentId,
      tenantId,
    });

    return {
      sessionId: session.id,
    };
  }

  private getAgentRuntime(): IAgentRuntime {
    if (!this.agentRuntime) {
      this.agentRuntime = this.moduleRef.get<IAgentRuntime>(AGENT_RUNTIME, {
        strict: false,
      });
    }

    return this.agentRuntime;
  }

  private readParams(params: unknown): AcpSessionNewParams {
    if (!isPlainObject(params)) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    const agentId = params.agentId;
    if (typeof agentId !== 'string' || agentId.length === 0) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    const cwd = this.readCwd(params.cwd);
    const mcpServers = this.readMcpServers(params.mcpServers);

    return {
      agentId,
      ...(cwd === undefined ? {} : { cwd }),
      ...(mcpServers === undefined ? {} : { mcpServers }),
    };
  }

  private readCwd(value: unknown): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== 'string' || value.length === 0 || !isAbsolute(value)) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    return value;
  }

  private readMcpServers(
    value: unknown,
  ): Readonly<Record<string, McpServerConfig>> | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (!isPlainObject(value)) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    return value as Readonly<Record<string, McpServerConfig>>;
  }
}
