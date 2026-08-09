import { isAbsolute, relative, resolve, sep } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../../../database/database.module';
import { sandboxSessions } from '../../../database/schema';
import { runInTenantTransaction } from '../../../common/interceptors/tenant-transaction.context';
import type { AcpTrackedSession } from '../acp-types';
import { AcpJsonRpcError } from '../acp-jsonrpc';
import {
  SANDBOX_RUNTIME_DRIVER,
  type SandboxRuntimeDriver,
} from '../../sandbox/sandbox-runtime-driver.port';

const SANDBOX_WORKSPACE_ROOT = '/workspace';
const MAX_TEXT_FILE_BYTES = 10 * 1024 * 1024;
const ACTIVE_SANDBOX_STATUSES = ['ready', 'busy'] as const;

interface SandboxSessionAccess {
  readonly containerId: string | null;
}

interface SandboxResolvedTarget {
  readonly runtimeHandle: string;
  readonly guestPath: string;
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
    @Inject(SANDBOX_RUNTIME_DRIVER)
    private readonly dockerService: SandboxRuntimeDriver,
  ) {}

  async readTextFile(
    params: SandboxReadTextFileParams,
  ): Promise<{ text: string }> {
    const target = await this.resolveTargetPath(
      params.trackedSession,
      params.path,
      'read',
    );
    let content: Buffer;
    try {
      content = await this.dockerService.readTextFile(
        target.runtimeHandle,
        target.guestPath,
        MAX_TEXT_FILE_BYTES,
      );
    } catch (error) {
      throw this.mapRuntimeFileError(error, 'read');
    }
    if (content.includes(0)) {
      throw this.createSandboxError(
        'ACP server sandbox file is binary and cannot be read as text',
        'sandbox_binary_file',
      );
    }
    return { text: content.toString('utf8') };
  }

  async writeTextFile(
    params: SandboxWriteTextFileParams,
  ): Promise<{ success: true }> {
    const target = await this.prepareWriteTarget(params);
    try {
      await this.dockerService.writeTextFile(
        target.runtimeHandle,
        target.guestPath,
        params.content,
        MAX_TEXT_FILE_BYTES,
      );
    } catch (error) {
      throw this.mapRuntimeFileError(error, 'write');
    }

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
    const runtimeHandle = await this.resolveRuntimeHandle(trackedSession);
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
    const guestPath = resolve(SANDBOX_WORKSPACE_ROOT, relativeWorkspacePath);
    if (operation === 'write') {
      try {
        await this.dockerService.validateTextFileWrite(
          runtimeHandle,
          guestPath,
          MAX_TEXT_FILE_BYTES,
        );
      } catch (error) {
        throw this.mapRuntimeFileError(error, 'write');
      }
    }
    return { runtimeHandle, guestPath };
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

  private async resolveRuntimeHandle(
    trackedSession: AcpTrackedSession,
  ): Promise<string> {
    const binding = this.readSandboxBinding(trackedSession);
    const sandboxSession = await runInTenantTransaction(
      this.db,
      trackedSession.tenantId,
      async (dbClient) => {
        const rows = await dbClient
          .select({ containerId: sandboxSessions.containerId })
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
      typeof sandboxSession.containerId !== 'string' ||
      sandboxSession.containerId.length === 0
    ) {
      throw this.createSandboxError(
        'ACP server sandbox runtime is unavailable',
        'sandbox_workspace_unavailable',
      );
    }
    return sandboxSession.containerId;
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

  private mapRuntimeFileError(
    error: unknown,
    operation: 'read' | 'write',
  ): AcpJsonRpcError {
    if (error instanceof AcpJsonRpcError) {
      return error;
    }
    const detail = error instanceof Error ? error.message : String(error);
    if (detail.includes('413')) {
      return this.createSandboxError(
        operation === 'read'
          ? 'ACP server sandbox file exceeds size limit'
          : 'ACP server sandbox content exceeds size limit',
        operation === 'read'
          ? 'sandbox_file_too_large'
          : 'sandbox_content_too_large',
      );
    }
    return this.createSandboxError(
      operation === 'read'
        ? 'ACP server sandbox path does not exist'
        : 'ACP server sandbox write target is unavailable',
      operation === 'read'
        ? 'sandbox_path_missing'
        : 'sandbox_path_escaped_workspace',
    );
  }

  private createSandboxError(message: string, reason: string): AcpJsonRpcError {
    return new AcpJsonRpcError(-32004, message, { reason });
  }
}
