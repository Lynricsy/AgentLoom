import { Injectable } from '@nestjs/common';
import { AcpJsonRpcError } from '../acp-jsonrpc';
import type {
  AcpConnectionState,
  AcpTerminalCreateParams,
  AcpTerminalCreateResult,
  AcpTerminalKillParams,
  AcpTerminalKillResult,
  AcpTerminalOutputParams,
  AcpTerminalOutputResult,
  AcpTerminalReleaseParams,
  AcpTerminalReleaseResult,
  AcpTrackedSession,
  AcpTerminalWaitForExitParams,
  AcpTerminalWaitForExitResult,
} from '../acp-types';
import { AcpTerminalProxyService } from '../services/acp-terminal-proxy.service';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class AcpTerminalHandler {
  constructor(private readonly terminalProxyService: AcpTerminalProxyService) {}

  async handleCreate(
    params: unknown,
    state: AcpConnectionState,
  ): Promise<AcpTerminalCreateResult> {
    const normalizedParams = this.readCreateParams(params);
    const trackedSession = this.getTrackedSession(
      state,
      normalizedParams.sessionId,
    );

    return this.terminalProxyService.createTerminal(
      {
        command: normalizedParams.command,
        args: normalizedParams.args,
        cwd: normalizedParams.cwd,
        mode: normalizedParams.mode,
        outputByteLimit: normalizedParams.outputByteLimit,
      },
      trackedSession,
    );
  }

  async handleOutput(
    params: unknown,
    state: AcpConnectionState,
  ): Promise<AcpTerminalOutputResult> {
    const normalizedParams = this.readOutputParams(params);
    const trackedSession = this.getTrackedSession(
      state,
      normalizedParams.sessionId,
    );

    return this.terminalProxyService.readTerminalOutput(
      {
        terminalId: normalizedParams.terminalId,
        offset: normalizedParams.offset,
        outputByteLimit: normalizedParams.outputByteLimit,
      },
      trackedSession,
    );
  }

  async handleWaitForExit(
    params: unknown,
    state: AcpConnectionState,
  ): Promise<AcpTerminalWaitForExitResult> {
    const normalizedParams = this.readWaitForExitParams(params);
    const trackedSession = this.getTrackedSession(
      state,
      normalizedParams.sessionId,
    );

    return this.terminalProxyService.waitForTerminalExit(
      {
        terminalId: normalizedParams.terminalId,
        timeoutMs: normalizedParams.timeoutMs,
      },
      trackedSession,
    );
  }

  async handleKill(
    params: unknown,
    state: AcpConnectionState,
  ): Promise<AcpTerminalKillResult> {
    const normalizedParams = this.readKillParams(params);
    const trackedSession = this.getTrackedSession(
      state,
      normalizedParams.sessionId,
    );

    return this.terminalProxyService.killTerminal(
      {
        terminalId: normalizedParams.terminalId,
      },
      trackedSession,
    );
  }

  async handleRelease(
    params: unknown,
    state: AcpConnectionState,
  ): Promise<AcpTerminalReleaseResult> {
    const normalizedParams = this.readReleaseParams(params);
    const trackedSession = this.getTrackedSession(
      state,
      normalizedParams.sessionId,
    );

    return this.terminalProxyService.releaseTerminal(
      {
        terminalId: normalizedParams.terminalId,
      },
      trackedSession,
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

  private readCreateParams(params: unknown): AcpTerminalCreateParams {
    if (!isPlainObject(params)) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    return {
      sessionId: this.readNonEmptyString(params.sessionId),
      command: this.readNonEmptyString(params.command),
      args: this.readStringArray(params.args),
      cwd: this.readOptionalNonEmptyString(params.cwd),
      mode: this.readMode(params.mode),
      outputByteLimit: this.readOptionalPositiveInteger(params.outputByteLimit),
    };
  }

  private readOutputParams(params: unknown): AcpTerminalOutputParams {
    if (!isPlainObject(params)) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    return {
      sessionId: this.readNonEmptyString(params.sessionId),
      terminalId: this.readNonEmptyString(params.terminalId),
      offset: this.readOptionalNonNegativeInteger(params.offset),
      outputByteLimit: this.readOptionalPositiveInteger(params.outputByteLimit),
    };
  }

  private readWaitForExitParams(params: unknown): AcpTerminalWaitForExitParams {
    if (!isPlainObject(params)) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    return {
      sessionId: this.readNonEmptyString(params.sessionId),
      terminalId: this.readNonEmptyString(params.terminalId),
      timeoutMs: this.readOptionalPositiveInteger(params.timeoutMs),
    };
  }

  private readKillParams(params: unknown): AcpTerminalKillParams {
    if (!isPlainObject(params)) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    return {
      sessionId: this.readNonEmptyString(params.sessionId),
      terminalId: this.readNonEmptyString(params.terminalId),
    };
  }

  private readReleaseParams(params: unknown): AcpTerminalReleaseParams {
    if (!isPlainObject(params)) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    return {
      sessionId: this.readNonEmptyString(params.sessionId),
      terminalId: this.readNonEmptyString(params.terminalId),
    };
  }

  private readMode(value: unknown): 'server_sandbox' {
    if (typeof value === 'undefined' || value === 'server_sandbox') {
      return 'server_sandbox';
    }

    throw new AcpJsonRpcError(-32602, 'Invalid params');
  }

  private readNonEmptyString(value: unknown): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    return value;
  }

  private readOptionalNonEmptyString(value: unknown): string | undefined {
    if (typeof value === 'undefined') {
      return undefined;
    }

    return this.readNonEmptyString(value);
  }

  private readStringArray(value: unknown): string[] | undefined {
    if (typeof value === 'undefined') {
      return undefined;
    }

    if (
      !Array.isArray(value) ||
      value.some((entry) => typeof entry !== 'string')
    ) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    return value;
  }

  private readOptionalPositiveInteger(value: unknown): number | undefined {
    if (typeof value === 'undefined') {
      return undefined;
    }

    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    return value;
  }

  private readOptionalNonNegativeInteger(value: unknown): number | undefined {
    if (typeof value === 'undefined') {
      return undefined;
    }

    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new AcpJsonRpcError(-32602, 'Invalid params');
    }

    return value;
  }
}
