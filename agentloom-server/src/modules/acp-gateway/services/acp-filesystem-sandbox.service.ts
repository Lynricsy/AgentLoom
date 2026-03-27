import {
  access,
  lstat,
  readFile,
  realpath,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../../database/database.module';
import { sandboxSessions } from '../../../database/schema';
import { runInTenantTransaction } from '../../../common/interceptors/tenant-transaction.context';
import type { AcpTrackedSession } from '../acp-types';
import { AcpJsonRpcError } from '../acp-jsonrpc';
import { DockerService } from '../../sandbox/docker.service';

const SANDBOX_WORKSPACE_ROOT = '/workspace';
const MAX_TEXT_FILE_BYTES = 10 * 1024 * 1024;
const ACTIVE_SANDBOX_STATUSES = ['ready', 'busy'] as const;

interface SandboxSessionAccess {
  readonly containerId: string | null;
  readonly workspacePath: string | null;
}

interface SandboxResolvedTarget {
  readonly hostPath: string;
}

export interface SandboxReadTextFileParams {
  readonly trackedSession: AcpTrackedSession;
  readonly path: string;
}

export interface SandboxWriteTextFileParams {
  readonly trackedSession: AcpTrackedSession;
  readonly path: string;
  readonly content: string;
}

@Injectable()
export class AcpFilesystemSandboxService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly dockerService: DockerService,
  ) {}

  async readTextFile(
    params: SandboxReadTextFileParams,
  ): Promise<{ text: string }> {
    const target = await this.resolveTargetPath(
      params.trackedSession,
      params.path,
      'read',
    );
    const targetStats = await this.readFileStats(target.hostPath);

    if (!targetStats.isFile()) {
      throw this.createSandboxError(
        'ACP server sandbox path must reference a regular file',
        'sandbox_target_not_file',
      );
    }

    if (targetStats.size > MAX_TEXT_FILE_BYTES) {
      throw this.createSandboxError(
        'ACP server sandbox file exceeds size limit',
        'sandbox_file_too_large',
      );
    }

    const content = await readFile(target.hostPath);

    if (this.isBinaryBuffer(content)) {
      throw this.createSandboxError(
        'ACP server sandbox file is binary and cannot be read as text',
        'sandbox_binary_file',
      );
    }

    return {
      text: content.toString('utf8'),
    };
  }

  async writeTextFile(
    params: SandboxWriteTextFileParams,
  ): Promise<{ success: true }> {
    const target = await this.prepareWriteTarget(params);

    await writeFile(target.hostPath, params.content, 'utf8');

    return {
      success: true,
    };
  }

  async validateWriteTextFile(
    params: SandboxWriteTextFileParams,
  ): Promise<void> {
    await this.prepareWriteTarget(params);
  }

  private async resolveTargetPath(
    trackedSession: AcpTrackedSession,
    pathValue: string,
    operation: 'read' | 'write',
  ): Promise<SandboxResolvedTarget> {
    const workspaceRoot = await this.resolveWorkspaceRoot(trackedSession);
    const workspaceRealPath = await this.resolveRealPath(
      workspaceRoot,
      'sandbox_workspace_unavailable',
      'ACP server sandbox workspace is unavailable',
    );
    const logicalPath = this.resolveLogicalSandboxPath(
      pathValue,
      trackedSession,
    );
    const relativeWorkspacePath = this.toWorkspaceRelativePath(logicalPath);

    if (relativeWorkspacePath === '') {
      throw this.createSandboxError(
        'ACP server sandbox path must reference a file inside workspace',
        'sandbox_workspace_root_targeted',
      );
    }

    const candidatePath = resolve(workspaceRealPath, relativeWorkspacePath);

    if (operation === 'read') {
      const resolvedTargetPath = await this.resolveRealPath(
        candidatePath,
        'sandbox_path_missing',
        'ACP server sandbox path does not exist',
      );

      this.ensureWithinWorkspace(
        resolvedTargetPath,
        workspaceRealPath,
        'sandbox_path_escaped_workspace',
      );

      return {
        hostPath: resolvedTargetPath,
      };
    }

    const targetExists = await this.pathExists(candidatePath);

    if (targetExists) {
      const resolvedTargetPath = await this.resolveRealPath(
        candidatePath,
        'sandbox_path_missing',
        'ACP server sandbox path does not exist',
      );

      this.ensureWithinWorkspace(
        resolvedTargetPath,
        workspaceRealPath,
        'sandbox_path_escaped_workspace',
      );

      const targetStats = await this.readFileStats(resolvedTargetPath);
      if (!targetStats.isFile()) {
        throw this.createSandboxError(
          'ACP server sandbox path must reference a regular file',
          'sandbox_target_not_file',
        );
      }

      return {
        hostPath: resolvedTargetPath,
      };
    }

    const parentRealPath = await this.resolveRealPath(
      dirname(candidatePath),
      'sandbox_parent_missing',
      'ACP server sandbox parent directory does not exist',
    );

    this.ensureWithinWorkspace(
      parentRealPath,
      workspaceRealPath,
      'sandbox_path_escaped_workspace',
    );

    return {
      hostPath: candidatePath,
    };
  }

  private async prepareWriteTarget(
    params: SandboxWriteTextFileParams,
  ): Promise<SandboxResolvedTarget> {
    this.ensureTextWriteContent(params.content);

    return this.resolveTargetPath(params.trackedSession, params.path, 'write');
  }

  private ensureTextWriteContent(content: string) {
    if (Buffer.byteLength(content, 'utf8') > MAX_TEXT_FILE_BYTES) {
      throw this.createSandboxError(
        'ACP server sandbox content exceeds size limit',
        'sandbox_content_too_large',
      );
    }

    if (content.includes('\u0000')) {
      throw this.createSandboxError(
        'ACP server sandbox content appears binary and cannot be written as text',
        'sandbox_binary_content',
      );
    }
  }

  private resolveLogicalSandboxPath(
    pathValue: string,
    trackedSession: AcpTrackedSession,
  ): string {
    if (!isAbsolute(pathValue)) {
      if (
        typeof trackedSession.cwd !== 'string' ||
        trackedSession.cwd.length === 0
      ) {
        throw new AcpJsonRpcError(-32602, 'Invalid params', {
          reason: 'Relative fs path requires session cwd',
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

  private async resolveWorkspaceRoot(
    trackedSession: AcpTrackedSession,
  ): Promise<string> {
    const binding = this.readSandboxBinding(trackedSession);

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

    if (this.isTrustedWorkspacePath(sandboxSession.workspacePath)) {
      return resolve(sandboxSession.workspacePath);
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

    return this.dockerService.getWorkspaceHostPath(sandboxSession.containerId);
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

  private isTrustedWorkspacePath(
    workspacePath: string | null,
  ): workspacePath is string {
    if (typeof workspacePath !== 'string' || workspacePath.length === 0) {
      return false;
    }

    const normalizedPath = resolve(workspacePath);
    return (
      isAbsolute(normalizedPath) && normalizedPath !== SANDBOX_WORKSPACE_ROOT
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
      return await realpath(pathValue);
    } catch {
      throw this.createSandboxError(message, reason);
    }
  }

  private async pathExists(pathValue: string): Promise<boolean> {
    try {
      await access(pathValue);
      return true;
    } catch {
      return false;
    }
  }

  private async readFileStats(pathValue: string) {
    try {
      const fileStats = await stat(pathValue);
      const fileLstat = await lstat(pathValue);

      if (fileLstat.isSymbolicLink() && !fileStats.isFile()) {
        throw this.createSandboxError(
          'ACP server sandbox symlink target is not a regular file',
          'sandbox_symlink_invalid_target',
        );
      }

      return fileStats;
    } catch (error) {
      if (error instanceof AcpJsonRpcError) {
        throw error;
      }

      throw this.createSandboxError(
        'ACP server sandbox path does not exist',
        'sandbox_path_missing',
      );
    }
  }

  private isBinaryBuffer(content: Buffer): boolean {
    return content.includes(0);
  }

  private createSandboxError(message: string, reason: string): AcpJsonRpcError {
    return new AcpJsonRpcError(-32004, message, { reason });
  }
}
