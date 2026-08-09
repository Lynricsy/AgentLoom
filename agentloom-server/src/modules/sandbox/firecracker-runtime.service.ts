import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { Agent, fetch as undiciFetch, type RequestInit } from 'undici';

import type { SandboxConfig } from '../../database/schema';
import type {
  RuntimeProcess,
  RuntimeStats,
  CreateRuntimePiContext,
  RuntimeExecCreateOptions,
  RuntimeExecExitInfo,
  RuntimeExecHandle,
  DeleteRuntimeOptions,
  SandboxRuntimeDriver,
} from './sandbox-runtime-driver.port';
import { SandboxRuntimeNotFoundException } from './sandbox.exceptions';

interface RuntimeResponse {
  runtimeHandle: string;
  state: string;
}

@Injectable()
export class FirecrackerRuntimeService implements SandboxRuntimeDriver {
  private readonly logger = new Logger(FirecrackerRuntimeService.name);
  private readonly baseUrl = (
    process.env.APP_FIRECRACKER_RUNTIME_URL ??
    'https://firecracker-runtime:8443'
  ).replace(/\/$/, '');
  private dispatcher?: Agent;

  async createRuntime(
    sessionId: string,
    config: SandboxConfig,
    _piContext?: CreateRuntimePiContext,
  ): Promise<{ runtimeHandle: string }> {
    const response = await this.managerJson<RuntimeResponse>('/v1/vms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: sessionId,
        cpu: config.cpu,
        memoryMiB: config.memory,
        diskGiB: config.disk,
        lifecycleMode: config.lifecycleMode ?? 'session',
        workspaceId: config.restoreWorkspaceId,
      }),
    });
    if (response.state === 'stopped') {
      await this.startRuntime(response.runtimeHandle);
    } else if (response.state !== 'running') {
      throw new Error(`Firecracker runtime is ${response.state}`);
    }
    return { runtimeHandle: response.runtimeHandle };
  }

  async startRuntime(runtimeHandle: string): Promise<void> {
    await this.managerRequest(
      `/v1/vms/${encodeURIComponent(runtimeHandle)}:start`,
      { method: 'POST' },
    );
  }

  async stopRuntime(runtimeHandle: string): Promise<void> {
    await this.managerRequest(
      `/v1/vms/${encodeURIComponent(runtimeHandle)}:stop`,
      { method: 'POST' },
    );
  }

  async deleteRuntime(
    runtimeHandle: string,
    options?: DeleteRuntimeOptions,
  ): Promise<void> {
    await this.managerRequest(
      `/v1/vms/${encodeURIComponent(runtimeHandle)}?deleteDisk=${options?.removeVolumes ?? true}`,
      { method: 'DELETE' },
    );
  }

  async inspectRuntime(runtimeHandle: string): Promise<{ state: string }> {
    const runtime = await this.managerJson<RuntimeResponse>(
      `/v1/vms/${encodeURIComponent(runtimeHandle)}`,
    );
    return { state: runtime.state };
  }

  async healthCheck(runtimeHandle: string): Promise<boolean> {
    try {
      const runtime = await this.managerJson<RuntimeResponse>(
        `/v1/vms/${encodeURIComponent(runtimeHandle)}`,
      );
      if (runtime.state !== 'running') return false;
      const response = await this.requestGuest(runtimeHandle, '/health');
      return response.ok;
    } catch {
      return false;
    }
  }

  getPromptUrl(runtimeHandle: string): Promise<string> {
    return Promise.resolve(this.guestUrl(runtimeHandle, '/v1/prompt'));
  }

  getSessionUrl(runtimeHandle: string): Promise<string> {
    return Promise.resolve(this.guestUrl(runtimeHandle, '/v1/session'));
  }

  async requestGuest(
    runtimeHandle: string,
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    return this.managerRequest(
      `/v1/vms/${encodeURIComponent(runtimeHandle)}/guest${path.startsWith('/') ? path : `/${path}`}`,
      init,
    );
  }

  async attachLogs(
    runtimeHandle: string,
    callback: (level: string, message: string) => void,
  ): Promise<void> {
    const response = await this.requestGuest(runtimeHandle, '/health');
    callback(
      response.ok ? 'info' : 'error',
      `Firecracker guest health status=${response.status}`,
    );
  }

  async getArchive(runtimeHandle: string, path: string): Promise<Readable> {
    const response = await this.requestGuest(
      runtimeHandle,
      `/v1/runtime/archive?path=${encodeURIComponent(path)}`,
    );
    if (!response.ok || !response.body) {
      throw new Error(`Guest archive failed with status ${response.status}`);
    }
    return Readable.fromWeb(response.body as never);
  }

  async putArchive(
    runtimeHandle: string,
    stream: Readable,
    path: string,
  ): Promise<void> {
    const response = await this.requestGuest(
      runtimeHandle,
      `/v1/runtime/archive?path=${encodeURIComponent(path)}`,
      { method: 'PUT', body: stream as never, duplex: 'half' },
    );
    if (!response.ok) {
      throw new Error(
        `Guest archive restore failed with status ${response.status}`,
      );
    }
  }

  async readTextFile(
    runtimeHandle: string,
    path: string,
    maxBytes: number,
  ): Promise<Buffer> {
    const response = await this.requestGuest(
      runtimeHandle,
      `/v1/runtime/files?path=${encodeURIComponent(path)}&maxBytes=${maxBytes}`,
    );
    if (!response.ok) {
      throw new Error(`Guest file read failed with status ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async validateTextFileWrite(
    runtimeHandle: string,
    path: string,
    maxBytes: number,
  ): Promise<void> {
    const response = await this.requestGuest(
      runtimeHandle,
      `/v1/runtime/files?path=${encodeURIComponent(path)}&maxBytes=${maxBytes}`,
      { method: 'HEAD' },
    );
    if (!response.ok) {
      throw new Error(
        `Guest file write validation failed with status ${response.status}`,
      );
    }
  }

  async writeTextFile(
    runtimeHandle: string,
    path: string,
    content: string,
    maxBytes: number,
  ): Promise<void> {
    const response = await this.requestGuest(
      runtimeHandle,
      `/v1/runtime/files?path=${encodeURIComponent(path)}&maxBytes=${maxBytes}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: content,
      },
    );
    if (!response.ok) {
      throw new Error(`Guest file write failed with status ${response.status}`);
    }
  }

  async createExec(
    runtimeHandle: string,
    options: RuntimeExecCreateOptions,
  ): Promise<RuntimeExecHandle> {
    const response = await this.requestGuest(
      runtimeHandle,
      '/v1/runtime/exec',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      },
    );
    const handle = await this.readJson<RuntimeExecHandle>(
      response,
      'create guest exec',
    );
    return { execId: `${runtimeHandle}:${handle.execId}` };
  }

  async attachExecOutput(
    execId: string,
    callback: (level: string, message: string) => void,
  ): Promise<void> {
    const [runtimeHandle, guestExecId] = this.parseExecHandle(execId);
    const response = await this.requestGuest(
      runtimeHandle,
      `/v1/runtime/exec/${encodeURIComponent(guestExecId)}/output`,
    );
    if (!response.ok || !response.body) {
      throw new Error(
        `Guest exec output failed with status ${response.status}`,
      );
    }
    const lines = createInterface({
      input: Readable.fromWeb(response.body as never),
      crlfDelay: Infinity,
    });
    for await (const line of lines) {
      const event = JSON.parse(line) as { level: string; data: string };
      callback(event.level, Buffer.from(event.data, 'base64').toString());
    }
  }

  async waitForExecExit(execId: string): Promise<RuntimeExecExitInfo> {
    const [runtimeHandle, guestExecId] = this.parseExecHandle(execId);
    const response = await this.requestGuest(
      runtimeHandle,
      `/v1/runtime/exec/${encodeURIComponent(guestExecId)}/wait`,
    );
    return this.readJson<RuntimeExecExitInfo>(response, 'wait for guest exec');
  }

  async killExec(execId: string, signal = 'TERM'): Promise<void> {
    const [runtimeHandle, guestExecId] = this.parseExecHandle(execId);
    const response = await this.requestGuest(
      runtimeHandle,
      `/v1/runtime/exec/${encodeURIComponent(guestExecId)}/kill`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal }),
      },
    );
    if (!response.ok) {
      throw new Error(`Kill guest exec failed with status ${response.status}`);
    }
  }

  async getRuntimeStats(runtimeHandle: string): Promise<RuntimeStats> {
    const response = await this.requestGuest(
      runtimeHandle,
      '/v1/runtime/stats',
    );
    return this.readJson<RuntimeStats>(response, 'read guest stats');
  }

  async listRuntimeProcesses(runtimeHandle: string): Promise<RuntimeProcess[]> {
    const response = await this.requestGuest(
      runtimeHandle,
      '/v1/runtime/processes',
    );
    return this.readJson<RuntimeProcess[]>(response, 'list guest processes');
  }

  private async managerJson<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    return this.readJson<T>(
      await this.managerRequest(path, init),
      `runtime manager ${init.method ?? 'GET'} ${path}`,
    );
  }

  private async managerRequest(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const response = await undiciFetch(`${this.baseUrl}${path}`, {
      ...init,
      dispatcher: this.getDispatcher(),
      signal:
        init.signal ??
        AbortSignal.timeout(path.includes('/guest/') ? 15 * 60_000 : 60_000),
    });
    if (response.status === 404 && !path.includes('/guest/')) {
      throw new SandboxRuntimeNotFoundException();
    }
    if (!response.ok && !path.includes('/guest/')) {
      await response.body?.cancel();
      throw new Error(
        `Firecracker runtime request failed (${response.status})`,
      );
    }
    return response as unknown as Response;
  }

  private async readJson<T>(response: Response, operation: string): Promise<T> {
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`${operation} failed with status ${response.status}`);
    }
    return (await response.json()) as T;
  }

  private getDispatcher(): Agent {
    if (this.dispatcher) return this.dispatcher;
    const caPath =
      process.env.APP_FIRECRACKER_RUNTIME_CA ??
      '/run/secrets/firecracker-client/ca.crt';
    const certPath =
      process.env.APP_FIRECRACKER_RUNTIME_CERT ??
      '/run/secrets/firecracker-client/tls.crt';
    const keyPath =
      process.env.APP_FIRECRACKER_RUNTIME_KEY ??
      '/run/secrets/firecracker-client/tls.key';
    this.dispatcher = new Agent({
      connect: {
        ca: readFileSync(caPath),
        cert: readFileSync(certPath),
        key: readFileSync(keyPath),
        rejectUnauthorized: true,
        servername:
          process.env.APP_FIRECRACKER_RUNTIME_SERVER_NAME ||
          new URL(this.baseUrl).hostname,
      },
      connectTimeout: 5_000,
      headersTimeout: 65_000,
      bodyTimeout: 0,
    });
    return this.dispatcher;
  }

  private guestUrl(runtimeHandle: string, path: string): string {
    return `${this.baseUrl}/v1/vms/${encodeURIComponent(runtimeHandle)}/guest${path}`;
  }

  private parseExecHandle(value: string): [string, string] {
    const separator = value.indexOf(':');
    if (separator <= 0 || separator === value.length - 1) {
      throw new Error('Invalid Firecracker exec handle');
    }
    return [value.slice(0, separator), value.slice(separator + 1)];
  }
}
