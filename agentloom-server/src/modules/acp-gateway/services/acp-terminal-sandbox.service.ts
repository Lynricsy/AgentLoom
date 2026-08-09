import { isAbsolute, relative, resolve, sep } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../../database/database.module';
import { runInTenantTransaction } from '../../../common/interceptors/tenant-transaction.context';
import { sandboxSessions } from '../../../database/schema';
import {
  SANDBOX_RUNTIME_DRIVER,
  type RuntimeExecExitInfo,
  type RuntimeExecHandle,
  type SandboxRuntimeDriver,
} from '../../sandbox/sandbox-runtime-driver.port';
import { AcpJsonRpcError } from '../acp-jsonrpc';
import type { AcpTrackedSession } from '../acp-types';

const SANDBOX_WORKSPACE_ROOT = '/workspace';
const ACTIVE_SANDBOX_STATUSES = ['ready', 'busy'] as const;

interface SandboxSessionAccess {
  readonly runtimeHandle: string | null;
}

export interface SandboxCreateTerminalParams {
  readonly trackedSession: AcpTrackedSession;
  readonly command: string;
  readonly args?: string[];
  readonly cwd?: string;
}

export interface SandboxCreateTerminalResult {
  readonly execId: string;
  readonly cwd: string;
}

interface ResolvedTerminalCwd {
  readonly logicalCwd: string;
  readonly execCwd: string;
}

@Injectable()
export class AcpTerminalSandboxService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    @Inject(SANDBOX_RUNTIME_DRIVER)
    private readonly runtimeDriver: SandboxRuntimeDriver,
  ) {}

  async createTerminal(
    params: SandboxCreateTerminalParams,
  ): Promise<SandboxCreateTerminalResult> {
    const access = await this.resolveSandboxAccess(params.trackedSession);
    const resolvedCwd = this.resolveTerminalCwd(
      params.trackedSession,
      params.cwd,
    );
    let exec: RuntimeExecHandle;
    try {
      exec = await this.runtimeDriver.createExec(access.runtimeHandle, {
        command: params.command,
        args: params.args,
        cwd: resolvedCwd.execCwd,
      });
    } catch {
      throw this.createSandboxError(
        'ACP server sandbox cwd does not exist or is not a directory',
        'sandbox_cwd_missing',
      );
    }

    return {
      execId: exec.execId,
      cwd: resolvedCwd.logicalCwd,
    };
  }

  async attachOutput(
    execId: string,
    callback: (stream: 'stdout' | 'stderr', chunk: string) => void,
  ): Promise<void> {
    await this.runtimeDriver.attachExecOutput(execId, (level, message) => {
      callback(level === 'stderr' ? 'stderr' : 'stdout', message);
    });
  }

  async killTerminal(execId: string, signal = 'TERM'): Promise<void> {
    await this.runtimeDriver.killExec(execId, signal);
  }

  async waitForExit(execId: string): Promise<RuntimeExecExitInfo> {
    return this.runtimeDriver.waitForExecExit(execId);
  }

  private async resolveSandboxAccess(
    trackedSession: AcpTrackedSession,
  ): Promise<{ runtimeHandle: string }> {
    const binding = this.readSandboxBinding(trackedSession);

    const sandboxSession = await runInTenantTransaction(
      this.db,
      trackedSession.tenantId,
      async (dbClient) => {
        const rows = await dbClient
          .select({ runtimeHandle: sandboxSessions.runtimeHandle })
          .from(sandboxSessions)
          .where(this.buildActiveSandboxWhere(trackedSession.tenantId, binding))
          .limit(1);

        return rows[0] satisfies SandboxSessionAccess | undefined;
      },
    );

    if (!sandboxSession) {
      throw this.createSandboxError(
        'ACP server sandbox session is unavailable',
        'sandbox_session_unavailable',
      );
    }

    if (
      typeof sandboxSession.runtimeHandle !== 'string' ||
      sandboxSession.runtimeHandle.length === 0
    ) {
      throw this.createSandboxError(
        'ACP server sandbox workspace is unavailable',
        'sandbox_workspace_unavailable',
      );
    }

    return { runtimeHandle: sandboxSession.runtimeHandle };
  }

  private buildActiveSandboxWhere(
    tenantId: string,
    binding: { executionId?: string; agentConversationId?: string },
  ) {
    if (binding.executionId && binding.agentConversationId) {
      return and(
        eq(sandboxSessions.executionId, binding.executionId),
        eq(sandboxSessions.agentConversationId, binding.agentConversationId),
        eq(sandboxSessions.tenantId, tenantId),
        inArray(sandboxSessions.status, [...ACTIVE_SANDBOX_STATUSES]),
      );
    }

    if (binding.executionId) {
      return and(
        eq(sandboxSessions.executionId, binding.executionId),
        eq(sandboxSessions.tenantId, tenantId),
        inArray(sandboxSessions.status, [...ACTIVE_SANDBOX_STATUSES]),
      );
    }

    if (binding.agentConversationId) {
      return and(
        eq(sandboxSessions.agentConversationId, binding.agentConversationId),
        eq(sandboxSessions.tenantId, tenantId),
        inArray(sandboxSessions.status, [...ACTIVE_SANDBOX_STATUSES]),
      );
    }

    throw this.createSandboxError(
      'ACP server sandbox is not bound to current session',
      'sandbox_binding_missing',
    );
  }

  private readSandboxBinding(trackedSession: AcpTrackedSession): {
    executionId?: string;
    agentConversationId?: string;
  } {
    const executionId = trackedSession.serverSandbox?.executionId;
    const agentConversationId =
      trackedSession.serverSandbox?.agentConversationId;

    if (!executionId && !agentConversationId) {
      throw this.createSandboxError(
        'ACP server sandbox is not bound to current session',
        'sandbox_binding_missing',
      );
    }

    return {
      ...(executionId ? { executionId } : {}),
      ...(agentConversationId ? { agentConversationId } : {}),
    };
  }

  private resolveTerminalCwd(
    trackedSession: AcpTrackedSession,
    cwd: string | undefined,
  ): ResolvedTerminalCwd {
    const logicalCwd = this.resolveLogicalSandboxPath(
      cwd ?? trackedSession.cwd,
      trackedSession,
    );
    const relativeWorkspacePath = this.toWorkspaceRelativePath(logicalCwd);
    return {
      logicalCwd,
      execCwd: resolve(SANDBOX_WORKSPACE_ROOT, relativeWorkspacePath),
    };
  }

  private resolveLogicalSandboxPath(
    pathValue: string | undefined,
    trackedSession: AcpTrackedSession,
  ): string {
    if (typeof pathValue !== 'string' || pathValue.length === 0) {
      throw new AcpJsonRpcError(-32602, 'Invalid params', {
        reason: 'Relative terminal cwd requires session cwd',
      });
    }

    if (!isAbsolute(pathValue)) {
      if (
        typeof trackedSession.cwd !== 'string' ||
        trackedSession.cwd.length === 0
      ) {
        throw new AcpJsonRpcError(-32602, 'Invalid params', {
          reason: 'Relative terminal cwd requires session cwd',
        });
      }

      return resolve(trackedSession.cwd, pathValue);
    }

    return resolve(pathValue);
  }

  private toWorkspaceRelativePath(logicalPath: string): string {
    const relativePath = relative(SANDBOX_WORKSPACE_ROOT, logicalPath);

    if (
      relativePath === '..' ||
      relativePath.startsWith(`..${sep}`) ||
      isAbsolute(relativePath)
    ) {
      throw this.createSandboxError(
        'ACP server sandbox path escapes workspace',
        'sandbox_path_escaped_workspace',
      );
    }

    return relativePath;
  }

  private createSandboxError(message: string, reason: string): AcpJsonRpcError {
    return new AcpJsonRpcError(-32004, message, { reason });
  }
}
