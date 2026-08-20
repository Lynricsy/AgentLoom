/**
 * Sandbox PTY 边界：在已就绪 guest 上代理 PTY 查询、buffer dump 与写入，
 * 不管理会话状态，也不解析流式 Agent 事件。
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  SANDBOX_RUNTIME_DRIVER,
  type SandboxRuntimeDriver,
} from '../sandbox/sandbox-runtime-driver.port';
import {
  SandboxSessionRuntimeService,
  type SandboxBinding,
} from './sandbox-session-runtime.service';

const REQUEST_TIMEOUT_MS = 3_600_000;

@Injectable()
export class SandboxPtyService {
  constructor(
    private readonly sessionRuntime: SandboxSessionRuntimeService,
    @Inject(SANDBOX_RUNTIME_DRIVER)
    private readonly runtimeDriver: SandboxRuntimeDriver,
  ) {}

  async listPtySessions(
    sandboxBinding: SandboxBinding,
    tenantId: string,
  ): Promise<unknown> {
    const sandbox = await this.sessionRuntime.waitForSandboxReady(
      sandboxBinding,
      tenantId,
    );
    const response = await this.runtimeDriver.requestGuest(
      sandbox.runtimeHandle,
      '/v1/pty/sessions',
      { method: 'GET', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );
    if (!response.ok) {
      throw new Error(`PTY sessions 查询失败: status=${response.status}`);
    }
    return response.json();
  }

  async ptyBufferDump(
    sandboxBinding: SandboxBinding,
    tenantId: string,
    ptySessionId: string,
    options?: { offset?: number; limit?: number; pattern?: string },
  ): Promise<unknown> {
    const sandbox = await this.sessionRuntime.waitForSandboxReady(
      sandboxBinding,
      tenantId,
    );
    const response = await this.runtimeDriver.requestGuest(
      sandbox.runtimeHandle,
      '/v1/pty/buffer-dump',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: ptySessionId, ...options }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new Error(`PTY buffer-dump 失败: status=${response.status}`);
    }
    return response.json();
  }

  async ptyWrite(
    sandboxBinding: SandboxBinding,
    tenantId: string,
    ptySessionId: string,
    data: string,
  ): Promise<unknown> {
    const sandbox = await this.sessionRuntime.waitForSandboxReady(
      sandboxBinding,
      tenantId,
    );
    const response = await this.runtimeDriver.requestGuest(
      sandbox.runtimeHandle,
      '/v1/pty/write',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: ptySessionId, data }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      throw new Error(`PTY write 失败: status=${response.status}`);
    }
    return response.json();
  }
}
