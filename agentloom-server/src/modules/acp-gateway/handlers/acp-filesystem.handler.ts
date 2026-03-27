import { Injectable } from '@nestjs/common';
import { AcpJsonRpcError } from '../acp-jsonrpc';
import type {
  AcpConnectionState,
  AcpReadTextFileParams,
  AcpReadTextFileResult,
  AcpTrackedSession,
  AcpWriteTextFileParams,
  AcpWriteTextFileResult,
} from '../acp-types';
import { AcpFilesystemProxyService } from '../services/acp-filesystem-proxy.service';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class AcpFilesystemHandler {
  constructor(
    private readonly filesystemProxyService: AcpFilesystemProxyService,
  ) {}

  async handleReadTextFile(
    params: unknown,
    state: AcpConnectionState,
  ): Promise<AcpReadTextFileResult> {
    const normalizedParams = this.readReadParams(params);
    const trackedSession = this.getTrackedSession(
      state,
      normalizedParams.sessionId,
    );

    return this.filesystemProxyService.readTextFile(
      {
        path: normalizedParams.path,
        mode: normalizedParams.mode,
      },
      trackedSession,
      state,
    );
  }

  async handleWriteTextFile(
    params: unknown,
    state: AcpConnectionState,
  ): Promise<AcpWriteTextFileResult> {
    const normalizedParams = this.readWriteParams(params);
    const trackedSession = this.getTrackedSession(
      state,
      normalizedParams.sessionId,
    );

    return this.filesystemProxyService.writeTextFile(
      {
        path: normalizedParams.path,
        content: normalizedParams.content,
        mode: normalizedParams.mode,
      },
      trackedSession,
      state,
    );
  }

  private getTrackedSession(
    state: AcpConnectionState,
    sessionId: string,
  ): AcpTrackedSession {
    const trackedSession = state.sessions?.get(sessionId);
    if (
      !trackedSession ||
      trackedSession.tenantId !== state.authContext?.tenantId
    ) {
      throw new AcpJsonRpcError(-32602, 'Invalid params', {
        sessionId,
        reason: 'Session not found',
      });
    }

    return trackedSession;
  }

  private readReadParams(params: unknown): AcpReadTextFileParams {
    if (!isPlainObject(params)) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    const sessionId = this.readNonEmptyString(params.sessionId);
    const path = this.readNonEmptyString(params.path);
    const mode = this.readMode(params.mode);

    return {
      sessionId,
      path,
      mode,
    };
  }

  private readWriteParams(params: unknown): AcpWriteTextFileParams {
    if (!isPlainObject(params)) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    const sessionId = this.readNonEmptyString(params.sessionId);
    const path = this.readNonEmptyString(params.path);
    const content = this.readString(params.content);
    const mode = this.readMode(params.mode);

    return {
      sessionId,
      path,
      content,
      mode,
    };
  }

  private readMode(value: unknown): 'client_proxy' | 'server_sandbox' {
    if (value === 'client_proxy' || value === 'server_sandbox') {
      return value;
    }

    throw new AcpJsonRpcError(-32602, 'Invalid params');
  }

  private readNonEmptyString(value: unknown): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    return value;
  }

  private readString(value: unknown): string {
    if (typeof value !== 'string') {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    return value;
  }
}
