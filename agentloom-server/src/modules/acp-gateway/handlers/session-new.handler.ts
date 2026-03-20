import { isAbsolute } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AGENT_RUNTIME, type IAgentRuntime } from '../../agent/ports/agent-runtime.port';
import type {
  McpServerConfig,
  ServerSandboxBinding,
} from '../../agent/types/agent-session.types';
import { AcpJsonRpcError } from '../acp-jsonrpc';
import { AcpSessionMcpRegistryService } from '../services/acp-session-mcp-registry.service';
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

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly mcpSessionService: AcpSessionMcpRegistryService,
  ) {}

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
      ...(normalizedParams.serverSandbox === undefined
        ? {}
        : { serverSandbox: normalizedParams.serverSandbox }),
    });

    const trackedSession: AcpTrackedSession = {
      sessionId: session.id,
      runtimeSessionId: session.id,
      agentId: session.agentId,
      tenantId,
      ...(normalizedParams.cwd === undefined ? {} : { cwd: normalizedParams.cwd }),
      ...(normalizedParams.serverSandbox === undefined
        ? {}
        : { serverSandbox: normalizedParams.serverSandbox }),
    };

    if (normalizedParams.mcpServers !== undefined) {
      try {
        await this.mcpSessionService.bootstrapSessionTools(
          trackedSession,
          normalizedParams.mcpServers,
        );
      } catch (error) {
        await this.safeCleanupSessionTools(trackedSession);
        await this.safeCancelRuntimeSession(session.id);
        throw new AcpJsonRpcError(
          -32603,
          'Failed to initialize ACP MCP forwarding',
          {
            sessionId: session.id,
            reason: this.getErrorMessage(error),
          },
        );
      }
    }

    const sessions = state.sessions ?? new Map<string, AcpTrackedSession>();
    state.sessions = sessions;
    sessions.set(session.id, trackedSession);

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
    const serverSandbox = this.readServerSandbox(params.serverSandbox);

    return {
      agentId,
      ...(cwd === undefined ? {} : { cwd }),
      ...(mcpServers === undefined ? {} : { mcpServers }),
      ...(serverSandbox === undefined ? {} : { serverSandbox }),
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

  private async safeCleanupSessionTools(
    trackedSession: AcpTrackedSession,
  ): Promise<void> {
    try {
      await this.mcpSessionService.cleanupSessionTools(trackedSession);
    } catch {
      return;
    }
  }

  private async safeCancelRuntimeSession(sessionId: string): Promise<void> {
    try {
      await this.getAgentRuntime().cancel(sessionId);
    } catch {
      return;
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private readServerSandbox(value: unknown): ServerSandboxBinding | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (!isPlainObject(value)) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    const executionId = value.executionId;
    if (typeof executionId !== 'string' || executionId.length === 0) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    return { executionId };
  }
}
