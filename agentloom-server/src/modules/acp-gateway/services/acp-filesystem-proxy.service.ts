import { isAbsolute, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import type { ContentBlock } from '../../agent/types/content-block.types';
import { AuditLogService } from '../../evidence/audit-log.service';
import { AcpJsonRpcError } from '../acp-jsonrpc';
import { AcpFilesystemSandboxService } from './acp-filesystem-sandbox.service';
import type {
  AcpConnectionState,
  AcpPermissionOption,
  AcpSessionRequestPermissionParams,
  AcpSessionRequestPermissionResult,
  AcpReadTextFileParams,
  AcpReadTextFileResult,
  AcpTrackedSession,
  AcpWriteTextFileParams,
  AcpWriteTextFileResult,
} from '../acp-types';

interface AcpClientReadTextFileResult {
  text?: unknown;
  cancelled?: unknown;
}

interface AcpClientWriteTextFileResult {
  success?: unknown;
  cancelled?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const ACP_PERMISSION_OPTIONS: AcpPermissionOption[] = [
  {
    optionId: 'allow-once',
    name: '允许一次',
    kind: 'allow_once',
  },
  {
    optionId: 'allow-always',
    name: '始终允许',
    kind: 'allow_always',
  },
  {
    optionId: 'reject-once',
    name: '拒绝一次',
    kind: 'reject_once',
  },
  {
    optionId: 'reject-always',
    name: '始终拒绝',
    kind: 'reject_always',
  },
];

@Injectable()
export class AcpFilesystemProxyService {
  constructor(
    private readonly auditLogService?: AuditLogService,
    private readonly sandboxFilesystemService?: AcpFilesystemSandboxService,
  ) {}

  async readTextFile(
    params: Omit<AcpReadTextFileParams, 'sessionId'>,
    trackedSession: AcpTrackedSession,
    state: AcpConnectionState,
  ): Promise<AcpReadTextFileResult> {
    if (params.mode === 'server_sandbox') {
      return this.readTextFileFromSandbox(params, trackedSession);
    }

    this.ensureClientCapability(state, 'readTextFile');
    const normalizedPath = this.normalizePath(params.path, trackedSession);
    const requestClient = state.requestClient;

    if (!requestClient) {
      throw new AcpJsonRpcError(-32004, 'ACP client fs proxy transport is unavailable');
    }

    const pendingRequest = requestClient<
      { sessionId: string; path: string },
      AcpClientReadTextFileResult
    >('fs/read_text_file', {
      sessionId: trackedSession.sessionId,
      path: normalizedPath,
    });

    this.trackPendingRequest(trackedSession, pendingRequest.requestId);

    try {
      const response = await pendingRequest.response;
      if (this.isCancelledResult(response)) {
        throw new AcpJsonRpcError(-32005, 'ACP client fs request was cancelled');
      }

      if (!isPlainObject(response) || typeof response.text !== 'string') {
        throw new AcpJsonRpcError(-32603, 'ACP client returned invalid fs response');
      }

      return {
        content: [
          {
            type: 'text',
            text: response.text,
          },
        ],
      };
    } catch (error) {
      if (error instanceof AcpJsonRpcError) {
        throw error;
      }

      throw new AcpJsonRpcError(-32603, 'ACP client fs request failed');
    } finally {
      this.untrackPendingRequest(trackedSession, pendingRequest.requestId);
    }
  }

  async writeTextFile(
    params: Omit<AcpWriteTextFileParams, 'sessionId'>,
    trackedSession: AcpTrackedSession,
    state: AcpConnectionState,
  ): Promise<AcpWriteTextFileResult> {
    if (params.mode === 'server_sandbox') {
      return this.writeTextFileToSandbox(params, trackedSession, state);
    }

    this.ensureClientCapability(state, 'writeTextFile');
    const normalizedPath = this.normalizePath(params.path, trackedSession);
    const requestClient = this.getRequestClient(state);

    await this.requestWritePermission(normalizedPath, trackedSession, requestClient);

    const pendingRequest = requestClient<
      { sessionId: string; path: string; content: string },
      AcpClientWriteTextFileResult
    >('fs/write_text_file', {
      sessionId: trackedSession.sessionId,
      path: normalizedPath,
      content: params.content,
    });

    this.trackPendingRequest(trackedSession, pendingRequest.requestId);

    try {
      const response = await pendingRequest.response;
      if (this.isCancelledResult(response)) {
        throw new AcpJsonRpcError(-32005, 'ACP client fs request was cancelled');
      }

      if (!isPlainObject(response) || response.success !== true) {
        throw new AcpJsonRpcError(-32603, 'ACP client returned invalid fs response');
      }

      return {
        success: true,
      };
    } catch (error) {
      if (error instanceof AcpJsonRpcError) {
        throw error;
      }

      throw new AcpJsonRpcError(-32603, 'ACP client fs request failed');
    } finally {
      this.untrackPendingRequest(trackedSession, pendingRequest.requestId);
    }
  }

  private async requestWritePermission(
    normalizedPath: string,
    trackedSession: AcpTrackedSession,
    requestClient: NonNullable<AcpConnectionState['requestClient']>,
  ): Promise<void> {
    const toolCallId = `acp-fs-write:${trackedSession.sessionId}:${Date.now()}`;
    const permissionDescription = `写入文件需要主人确认：${normalizedPath}`;
    const params: AcpSessionRequestPermissionParams = {
      sessionId: trackedSession.sessionId,
      toolCall: {
        toolCallId,
        title: 'filesystem.write',
        kind: 'tool_call',
        status: 'awaiting_permission',
        content: [
          {
            type: 'text',
            text: permissionDescription,
          } satisfies ContentBlock,
        ],
        permissionRequest: {
          description: permissionDescription,
          resourcePaths: [normalizedPath],
        },
      },
      options: ACP_PERMISSION_OPTIONS,
    };

    const pendingRequest = requestClient<
      AcpSessionRequestPermissionParams,
      AcpSessionRequestPermissionResult
    >('session/request_permission', params);

    trackedSession.pendingPermissionRequestId = pendingRequest.requestId;
    trackedSession.pendingPermissionToolCallId = toolCallId;

    try {
      const response = this.validatePermissionResponse(await pendingRequest.response);

      if (response.outcome.outcome === 'cancelled') {
        await this.recordAudit(trackedSession, 'acp.fs.permission.cancelled', {
          summary: 'Cancelled ACP file write permission request',
          metadata: {
            operation: 'write_text_file',
            path: normalizedPath,
            reason: 'permission_cancelled',
          },
        });
        throw new AcpJsonRpcError(-32005, 'ACP file permission request was cancelled');
      }

      if (this.mapPermissionOptionToAction(response.outcome.optionId) === 'deny') {
        await this.recordAudit(trackedSession, 'acp.fs.permission.denied', {
          summary: 'Rejected ACP file write by permission policy',
          metadata: {
            operation: 'write_text_file',
            path: normalizedPath,
            optionId: response.outcome.optionId,
            reason: 'permission_denied',
          },
        });
        throw new AcpJsonRpcError(
          -32004,
          'ACP file operation was rejected by permission policy',
        );
      }
    } finally {
      delete trackedSession.pendingPermissionRequestId;
      delete trackedSession.pendingPermissionToolCallId;
    }
  }

  private ensureClientCapability(
    state: AcpConnectionState,
    capability: 'readTextFile' | 'writeTextFile',
  ) {
    if (state.clientCapabilities?.fs?.[capability] !== true) {
      throw new AcpJsonRpcError(
        -32004,
        'ACP client does not support requested fs capability',
      );
    }
  }

  private getRequestClient(
    state: AcpConnectionState,
  ): NonNullable<AcpConnectionState['requestClient']> {
    if (!state.requestClient) {
      throw new AcpJsonRpcError(-32004, 'ACP client fs proxy transport is unavailable');
    }

    return state.requestClient;
  }

  private async readTextFileFromSandbox(
    params: Omit<AcpReadTextFileParams, 'sessionId'>,
    trackedSession: AcpTrackedSession,
  ): Promise<AcpReadTextFileResult> {
    if (!trackedSession.serverSandbox) {
      await this.recordSandboxRejection(
        trackedSession,
        'read_text_file',
        params.path,
        'sandbox_binding_missing',
      );
      throw new AcpJsonRpcError(
        -32004,
        'ACP server sandbox is not bound to current session',
        { reason: 'sandbox_binding_missing' },
      );
    }

    try {
      const response = await this.getSandboxFilesystemService().readTextFile({
        trackedSession,
        path: params.path,
      });

      if (typeof response.text !== 'string') {
        throw new AcpJsonRpcError(
          -32603,
          'ACP server sandbox returned invalid fs response',
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: response.text,
          },
        ],
      };
    } catch (error) {
      await this.recordSandboxError(
        trackedSession,
        'read_text_file',
        params.path,
        error,
      );

      if (error instanceof AcpJsonRpcError) {
        throw error;
      }

      throw new AcpJsonRpcError(-32603, 'ACP server sandbox fs request failed');
    }
  }

  private async writeTextFileToSandbox(
    params: Omit<AcpWriteTextFileParams, 'sessionId'>,
    trackedSession: AcpTrackedSession,
    state: AcpConnectionState,
  ): Promise<AcpWriteTextFileResult> {
    if (!trackedSession.serverSandbox) {
      await this.recordSandboxRejection(
        trackedSession,
        'write_text_file',
        params.path,
        'sandbox_binding_missing',
      );
      throw new AcpJsonRpcError(
        -32004,
        'ACP server sandbox is not bound to current session',
        { reason: 'sandbox_binding_missing' },
      );
    }

    const normalizedPath = this.normalizePath(params.path, trackedSession);
    const requestClient = this.getRequestClient(state);
    const sandboxFilesystemService = this.getSandboxFilesystemService();

    try {
      await sandboxFilesystemService.validateWriteTextFile({
        trackedSession,
        path: params.path,
        content: params.content,
      });
    } catch (error) {
      await this.recordSandboxError(
        trackedSession,
        'write_text_file',
        params.path,
        error,
      );

      if (error instanceof AcpJsonRpcError) {
        throw error;
      }

      throw new AcpJsonRpcError(-32603, 'ACP server sandbox fs request failed');
    }

    await this.requestWritePermission(normalizedPath, trackedSession, requestClient);

    try {
      const response = await sandboxFilesystemService.writeTextFile({
        trackedSession,
        path: params.path,
        content: params.content,
      });

      if (!isPlainObject(response) || response.success !== true) {
        throw new AcpJsonRpcError(
          -32603,
          'ACP server sandbox returned invalid fs response',
        );
      }

      return {
        success: true,
      };
    } catch (error) {
      await this.recordSandboxError(
        trackedSession,
        'write_text_file',
        params.path,
        error,
      );

      if (error instanceof AcpJsonRpcError) {
        throw error;
      }

      throw new AcpJsonRpcError(-32603, 'ACP server sandbox fs request failed');
    }
  }

  private getSandboxFilesystemService(): AcpFilesystemSandboxService {
    if (!this.sandboxFilesystemService) {
      throw new AcpJsonRpcError(
        -32603,
        'ACP server sandbox fs service is unavailable',
        { reason: 'sandbox_service_unavailable' },
      );
    }

    return this.sandboxFilesystemService;
  }

  private async recordSandboxError(
    trackedSession: AcpTrackedSession,
    operation: 'read_text_file' | 'write_text_file',
    pathValue: string,
    error: unknown,
  ): Promise<void> {
    if (!(error instanceof AcpJsonRpcError)) {
      return;
    }

    const reason = this.extractSandboxReason(error);
    if (reason === 'sandbox_binding_missing') {
      return;
    }

    await this.recordSandboxRejection(
      trackedSession,
      operation,
      pathValue,
      reason,
    );
  }

  private async recordSandboxRejection(
    trackedSession: AcpTrackedSession,
    operation: 'read_text_file' | 'write_text_file',
    pathValue: string,
    reason: string,
  ): Promise<void> {
    await this.recordAudit(trackedSession, 'acp.fs.server_sandbox.rejected', {
      summary: `Rejected ACP server_sandbox ${operation} request`,
      metadata: {
        operation,
        path: pathValue,
        mode: 'server_sandbox',
        reason,
      },
    });
  }

  private extractSandboxReason(error: AcpJsonRpcError): string {
    if (
      isPlainObject(error.data) &&
      typeof error.data.reason === 'string' &&
      error.data.reason.length > 0
    ) {
      return error.data.reason;
    }

    return 'sandbox_request_failed';
  }

  private normalizePath(pathValue: string, trackedSession: AcpTrackedSession): string {
    if (!isAbsolute(pathValue)) {
      if (typeof trackedSession.cwd !== 'string' || trackedSession.cwd.length === 0) {
        throw new AcpJsonRpcError(-32602, 'Invalid params', {
          reason: 'Relative fs path requires session cwd',
        });
      }

      return resolve(trackedSession.cwd, pathValue);
    }

    return resolve(pathValue);
  }

  private trackPendingRequest(
    trackedSession: AcpTrackedSession,
    requestId: string | number | null,
  ) {
    trackedSession.pendingFsRequestIds = [
      ...(trackedSession.pendingFsRequestIds ?? []),
      requestId,
    ];
  }

  private untrackPendingRequest(
    trackedSession: AcpTrackedSession,
    requestId: string | number | null,
  ) {
    if (!trackedSession.pendingFsRequestIds) {
      return;
    }

    const nextPendingRequestIds = trackedSession.pendingFsRequestIds.filter(
      (entry) => entry !== requestId,
    );

    if (nextPendingRequestIds.length === 0) {
      delete trackedSession.pendingFsRequestIds;
      return;
    }

    trackedSession.pendingFsRequestIds = nextPendingRequestIds;
  }

  private isCancelledResult(
    value: unknown,
  ): value is { cancelled: true } {
    return isPlainObject(value) && value.cancelled === true;
  }

  private validatePermissionResponse(
    response: unknown,
  ): AcpSessionRequestPermissionResult {
    if (!isPlainObject(response) || !isPlainObject(response.outcome)) {
      throw new AcpJsonRpcError(
        -32603,
        'Invalid permission response from ACP client',
      );
    }

    const outcome = response.outcome;
    if (outcome.outcome === 'cancelled') {
      return {
        outcome: {
          outcome: 'cancelled',
        },
      };
    }

    if (
      outcome.outcome === 'selected' &&
      typeof outcome.optionId === 'string' &&
      outcome.optionId.length > 0
    ) {
      return {
        outcome: {
          outcome: 'selected',
          optionId: outcome.optionId,
        },
      };
    }

    throw new AcpJsonRpcError(
      -32603,
      'Invalid permission response from ACP client',
    );
  }

  private mapPermissionOptionToAction(
    optionId: string,
  ): 'approve' | 'deny' {
    switch (optionId) {
      case 'allow-once':
      case 'allow-always':
        return 'approve';
      case 'reject-once':
      case 'reject-always':
        return 'deny';
      default:
        throw new AcpJsonRpcError(-32603, 'Unsupported permission option');
    }
  }

  private async recordAudit(
    trackedSession: AcpTrackedSession,
    eventType: string,
    payload: {
      summary: string;
      metadata: Record<string, unknown>;
    },
  ): Promise<void> {
    if (!this.auditLogService) {
      return;
    }

    await this.auditLogService.record({
      tenantId: trackedSession.tenantId,
      actorId: null,
      actorType: 'service',
      eventType,
      resourceType: 'acp_session',
      resourceId: trackedSession.sessionId,
      summary: payload.summary,
      metadata: payload.metadata,
    });
  }
}
