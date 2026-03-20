import { access, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import {
  DRIZZLE,
  type DrizzleDB,
} from '../../../database/database.module';
import { runInTenantTransaction } from '../../../common/interceptors/tenant-transaction.context';
import { sandboxSessions } from '../../../database/schema';
import { DockerService, type DockerExecExitInfo } from '../../sandbox/docker.service';
import { AcpJsonRpcError } from '../acp-jsonrpc';
import type { AcpTrackedSession } from '../acp-types';

const SANDBOX_WORKSPACE_ROOT = '/workspace';
const ACTIVE_SANDBOX_STATUSES = ['ready', 'busy'] as const;

interface SandboxSessionAccess {
  readonly containerId: string | null;
  readonly workspacePath: string | null;
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
    private readonly dockerService: DockerService,
  ) {}

  async createTerminal(
    params: SandboxCreateTerminalParams,
  ): Promise<SandboxCreateTerminalResult> {
    const access = await this.resolveSandboxAccess(params.trackedSession);
    const workspaceRoot = await this.resolveWorkspaceRoot(
      params.trackedSession,
      access,
    );
    const resolvedCwd = await this.resolveTerminalCwd(
      params.trackedSession,
      params.cwd,
      workspaceRoot,
    );
    const exec = await this.dockerService.createExec(access.containerId, {
      command: params.command,
      args: params.args,
      cwd: resolvedCwd.execCwd,
    });

    return {
      execId: exec.execId,
      cwd: resolvedCwd.logicalCwd,
    };
  }

  async attachOutput(
    execId: string,
    callback: (stream: 'stdout' | 'stderr', chunk: string) => void,
  ): Promise<void> {
    await this.dockerService.attachExecOutput(execId, (level, message) => {
      callback(level === 'stderr' ? 'stderr' : 'stdout', message);
    });
  }

  async killTerminal(execId: string, signal = 'TERM'): Promise<void> {
    await this.dockerService.killExec(execId, signal);
  }

  async waitForExit(execId: string): Promise<DockerExecExitInfo> {
    return this.dockerService.waitForExecExit(execId);
  }

  private async resolveSandboxAccess(
    trackedSession: AcpTrackedSession,
  ): Promise<{ containerId: string; workspacePath: string | null }> {
    const executionId = trackedSession.serverSandbox?.executionId;
    if (typeof executionId !== 'string' || executionId.length === 0) {
      throw this.createSandboxError(
        'ACP server sandbox is not bound to current session',
        'sandbox_binding_missing',
      );
    }

    const sandboxSession = await runInTenantTransaction(
      this.db,
      trackedSession.tenantId,
      async (dbClient) => {
        const rows = await dbClient
          .select({
            containerId: sandboxSessions.containerId,
            workspacePath: sandboxSessions.workspacePath,
          })
          .from(sandboxSessions)
          .where(
            and(
              eq(sandboxSessions.executionId, executionId),
              eq(sandboxSessions.tenantId, trackedSession.tenantId),
              inArray(sandboxSessions.status, [...ACTIVE_SANDBOX_STATUSES]),
            ),
          )
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
      typeof sandboxSession.containerId !== 'string' ||
      sandboxSession.containerId.length === 0
    ) {
      throw this.createSandboxError(
        'ACP server sandbox workspace is unavailable',
        'sandbox_workspace_unavailable',
      );
    }

    return {
      containerId: sandboxSession.containerId,
      workspacePath: sandboxSession.workspacePath,
    };
  }

  private async resolveWorkspaceRoot(
    _trackedSession: AcpTrackedSession,
    access: { containerId: string; workspacePath: string | null },
  ): Promise<string> {
    if (this.isTrustedWorkspacePath(access.workspacePath)) {
      return this.resolveRealPath(
        resolve(access.workspacePath),
        'sandbox_workspace_unavailable',
        'ACP server sandbox workspace is unavailable',
      );
    }

    return this.resolveRealPath(
      await this.dockerService.getWorkspaceHostPath(access.containerId),
      'sandbox_workspace_unavailable',
      'ACP server sandbox workspace is unavailable',
    );
  }

  private async resolveTerminalCwd(
    trackedSession: AcpTrackedSession,
    cwd: string | undefined,
    workspaceRoot: string,
  ): Promise<ResolvedTerminalCwd> {
    const logicalCwd = this.resolveLogicalSandboxPath(
      cwd ?? trackedSession.cwd,
      trackedSession,
    );
    const relativeWorkspacePath = this.toWorkspaceRelativePath(logicalCwd);
    const workspaceRealPath = await this.resolveRealPath(
      workspaceRoot,
      'sandbox_workspace_unavailable',
      'ACP server sandbox workspace is unavailable',
    );
    const candidatePath = resolve(workspaceRealPath, relativeWorkspacePath);
    const resolvedTargetPath = await this.resolveRealPath(
      candidatePath,
      'sandbox_cwd_missing',
      'ACP server sandbox cwd does not exist',
    );

    this.ensureWithinWorkspace(
      resolvedTargetPath,
      workspaceRealPath,
      'sandbox_path_escaped_workspace',
    );

    const targetStats = await stat(resolvedTargetPath);
    if (!targetStats.isDirectory()) {
      throw this.createSandboxError(
        'ACP server sandbox cwd must reference a directory',
        'sandbox_cwd_not_directory',
      );
    }

    return {
      logicalCwd,
      execCwd:
        process.env.ACP_TEST_FAKE_RUNTIME === '1'
          ? resolvedTargetPath
          : logicalCwd,
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
      if (typeof trackedSession.cwd !== 'string' || trackedSession.cwd.length === 0) {
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

  private isTrustedWorkspacePath(
    workspacePath: string | null,
  ): workspacePath is string {
    if (typeof workspacePath !== 'string' || workspacePath.length === 0) {
      return false;
    }

    const normalizedPath = resolve(workspacePath);
    return (
      isAbsolute(normalizedPath) &&
      normalizedPath !== SANDBOX_WORKSPACE_ROOT
    );
  }

  private ensureWithinWorkspace(
    resolvedPath: string,
    workspaceRoot: string,
    reason: string,
  ) {
    const relativePath = relative(workspaceRoot, resolvedPath);

    if (
      relativePath === '..' ||
      relativePath.startsWith(`..${sep}`) ||
      isAbsolute(relativePath)
    ) {
      throw this.createSandboxError(
        'ACP server sandbox path escapes workspace',
        reason,
      );
    }
  }

  private async resolveRealPath(
    pathValue: string,
    reason: string,
    message: string,
  ): Promise<string> {
    try {
      await access(pathValue);
      return await realpath(pathValue);
    } catch {
      throw this.createSandboxError(message, reason);
    }
  }

  private createSandboxError(message: string, reason: string): AcpJsonRpcError {
    return new AcpJsonRpcError(-32004, message, { reason });
  }
}
