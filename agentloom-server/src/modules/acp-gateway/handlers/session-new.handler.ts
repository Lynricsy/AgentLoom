import { isAbsolute } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { and, eq } from 'drizzle-orm';
import { validate as isUuid } from 'uuid';
import type { IAgentRuntime } from '../../agent/ports/agent-runtime.port';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { runInTenantTransaction } from '../../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../../database/database.module';
import {
  agentDefinitions,
  agentVersions,
} from '../../../database/schema/agent-definitions.schema';
import { AgentNotPublishedException } from '../../agent-api/agent-api.exceptions';
import {
  AgentArchivedException,
  AgentNotFoundException,
} from '../../agent-definition/agent-definition.exceptions';
import { AgentDefinitionService } from '../../agent-definition/agent-definition.service';
import { resolveAcpAgentRuntime } from '../resolve-acp-agent-runtime';
import type {
  CreateSessionParams,
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
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly moduleRef: ModuleRef,
    private readonly mcpSessionService: AcpSessionMcpRegistryService,
    private readonly agentDefinitionService: AgentDefinitionService,
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
    try {
      return await runInTenantTransaction(this.db, tenantId, async (tx) => {
        const agentRuntimeParams = await this.resolvePublishedAgent(
          tx,
          tenantId,
          normalizedParams.agentId,
        );
        const session = await this.getAgentRuntime().createSession({
          agentId: normalizedParams.agentId,
          mode: 'conversation',
          tenantId,
          ...agentRuntimeParams,
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
          ...(normalizedParams.cwd === undefined
            ? {}
            : { cwd: normalizedParams.cwd }),
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
      });
    } catch (error) {
      if (
        error instanceof AcpJsonRpcError ||
        error instanceof DomainException
      ) {
        throw error;
      }

      throw new AcpJsonRpcError(-32603, 'Failed to create ACP session', {
        reason: this.getErrorMessage(error),
      });
    }
  }

  /**
   * 会话按 Agent 的已发布版本运行：Agent 必须属于当前租户（RLS 事务内查询）、
   * 未归档且已发布。ACP 会话由进程内运行时执行，sandbox 运行态的 Agent 不能在此运行，
   * 否则沙箱隔离（及 stdio MCP 只在沙箱内执行的约束）会被绕过。
   */
  private async resolvePublishedAgent(
    tx: DrizzleDB,
    tenantId: string,
    agentId: string,
  ): Promise<
    Pick<CreateSessionParams, 'llmModelConfigId' | 'systemPrompt'> &
      Required<Pick<CreateSessionParams, 'runtimeConfig'>>
  > {
    if (!isUuid(agentId)) {
      throw new AgentNotFoundException(agentId);
    }

    const [agent] = await tx
      .select({
        status: agentDefinitions.status,
        runtimeMode: agentDefinitions.runtimeMode,
        publishedVersionId: agentDefinitions.publishedVersionId,
      })
      .from(agentDefinitions)
      .where(
        and(
          eq(agentDefinitions.id, agentId),
          eq(agentDefinitions.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!agent) {
      throw new AgentNotFoundException(agentId);
    }
    if (agent.status === 'archived') {
      throw new AgentArchivedException(agentId);
    }
    if (agent.status !== 'published' || !agent.publishedVersionId) {
      throw new AgentNotPublishedException(agentId);
    }

    const [version] = await tx
      .select({ snapshot: agentVersions.snapshot })
      .from(agentVersions)
      .where(
        and(
          eq(agentVersions.id, agent.publishedVersionId),
          eq(agentVersions.agentDefinitionId, agentId),
        ),
      )
      .limit(1);
    if (!version) {
      throw new AgentNotPublishedException(agentId);
    }

    const { snapshot } = version;
    const runtimeMode =
      snapshot.runtimeMode === 'sandbox' ||
      snapshot.runtimeMode === 'no_sandbox'
        ? snapshot.runtimeMode
        : agent.runtimeMode;
    if (runtimeMode !== 'no_sandbox') {
      throw new AcpJsonRpcError(-32602, 'Invalid params', {
        agentId,
        reason: 'Only no_sandbox agents can run over ACP',
      });
    }

    const runtimeConfig =
      this.agentDefinitionService.buildRuntimeConfigFromNodes(
        snapshot.nodes,
        snapshot.edges,
        agentId,
        runtimeMode,
      );
    const systemPrompt =
      this.agentDefinitionService.resolveSystemPromptFromNodes(
        snapshot.nodes,
        snapshot.edges,
      ) ?? snapshot.systemPrompt;

    return {
      runtimeConfig,
      ...(runtimeConfig.modelConfig?.modelId
        ? { llmModelConfigId: runtimeConfig.modelConfig.modelId }
        : {}),
      ...(systemPrompt ? { systemPrompt } : {}),
    };
  }

  private getAgentRuntime(): IAgentRuntime {
    if (!this.agentRuntime) {
      this.agentRuntime = resolveAcpAgentRuntime(this.moduleRef);
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
    if (
      executionId !== undefined &&
      (typeof executionId !== 'string' || executionId.length === 0)
    ) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    const agentConversationId = value.agentConversationId;
    if (
      agentConversationId !== undefined &&
      (typeof agentConversationId !== 'string' ||
        agentConversationId.length === 0)
    ) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    if (
      typeof executionId !== 'string' &&
      typeof agentConversationId !== 'string'
    ) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    return {
      ...(typeof executionId === 'string' ? { executionId } : {}),
      ...(typeof agentConversationId === 'string'
        ? { agentConversationId }
        : {}),
    } as ServerSandboxBinding;
  }
}
