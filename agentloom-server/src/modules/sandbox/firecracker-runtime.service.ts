import { Injectable, Logger } from '@nestjs/common';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { fetch as undiciFetch, type RequestInit } from 'undici';

import type { SandboxConfig, SandboxRuntimeNode } from '../../database/schema';
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
import {
  composeRuntimeHandle,
  splitRuntimeHandle,
} from './sandbox-runtime-handle.util';
import {
  SandboxRuntimeNodeRegistryService,
  type CapacitySnapshot,
} from './sandbox-runtime-node-registry.service';
import {
  SandboxCreationException,
  SandboxRuntimeNotFoundException,
} from './sandbox.exceptions';

interface RuntimeResponse {
  runtimeHandle: string;
  state: string;
}

/** 节点解析结果：manager 基址 + 该节点内的裸 handle。 */
interface RuntimeTarget {
  node: SandboxRuntimeNode;
  managerHandle: string;
}

@Injectable()
export class FirecrackerRuntimeService implements SandboxRuntimeDriver {
  private readonly logger = new Logger(FirecrackerRuntimeService.name);

  constructor(private readonly registry: SandboxRuntimeNodeRegistryService) {}

  /**
   * 容量感知调度：探针筛出有余量的节点，按空闲内存比降序依次尝试。
   *
   * 返回的 handle 是复合格式 `<nodeId>/<managerHandle>`——manager 侧 handle 仍
   * 是裸 sessionId，节点前缀纯属 server 侧编码，用于后续所有操作路由回原节点。
   */
  async createRuntime(
    sessionId: string,
    config: SandboxConfig,
    _piContext?: CreateRuntimePiContext,
  ): Promise<{ runtimeHandle: string }> {
    const candidates = await this.pickNodes(config);
    const body = JSON.stringify({
      id: sessionId,
      cpu: config.cpu,
      memoryMiB: config.memory,
      diskGiB: config.disk,
      lifecycleMode: config.lifecycleMode ?? 'session',
      workspaceId: config.restoreWorkspaceId,
    });
    const tried: string[] = [];
    for (const node of candidates) {
      tried.push(node.id);
      let response: RuntimeResponse;
      try {
        response = await this.managerJson<RuntimeResponse>(node, '/v1/vms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
      } catch (error) {
        // 503（节点满）与网络错误换下一个节点；其余状态码是配置/请求问题，
        // 换节点只会把同一个错误重复 N 次，直接上抛。
        if (isRetryableNodeFailure(error)) {
          this.logger.warn(
            `Sandbox runtime node ${node.id} rejected create: ${String(error)}`,
          );
          continue;
        }
        throw error;
      }
      const runtimeHandle = composeRuntimeHandle(
        node.id,
        response.runtimeHandle,
      );
      if (response.state === 'stopped') {
        await this.startRuntime(runtimeHandle);
      } else if (response.state !== 'running') {
        throw new Error(`Firecracker runtime is ${response.state}`);
      }
      return { runtimeHandle };
    }
    throw new SandboxCreationException(
      `All sandbox runtime nodes exhausted (${tried.join(', ')})`,
    );
  }

  async startRuntime(runtimeHandle: string): Promise<void> {
    const { node, managerHandle } = await this.resolveTarget(runtimeHandle);
    await this.managerRequest(
      node,
      `/v1/vms/${encodeURIComponent(managerHandle)}:start`,
      { method: 'POST' },
    );
  }

  async stopRuntime(runtimeHandle: string): Promise<void> {
    const { node, managerHandle } = await this.resolveTarget(runtimeHandle);
    await this.managerRequest(
      node,
      `/v1/vms/${encodeURIComponent(managerHandle)}:stop`,
      { method: 'POST' },
    );
  }

  async deleteRuntime(
    runtimeHandle: string,
    options?: DeleteRuntimeOptions,
  ): Promise<void> {
    const { node, managerHandle } = await this.resolveTarget(runtimeHandle);
    await this.managerRequest(
      node,
      `/v1/vms/${encodeURIComponent(managerHandle)}?deleteDisk=${options?.removeVolumes ?? true}`,
      { method: 'DELETE' },
    );
  }

  async inspectRuntime(runtimeHandle: string): Promise<{ state: string }> {
    const { node, managerHandle } = await this.resolveTarget(runtimeHandle);
    const runtime = await this.managerJson<RuntimeResponse>(
      node,
      `/v1/vms/${encodeURIComponent(managerHandle)}`,
    );
    return { state: runtime.state };
  }

  async healthCheck(runtimeHandle: string): Promise<boolean> {
    try {
      const { node, managerHandle } = await this.resolveTarget(runtimeHandle);
      const runtime = await this.managerJson<RuntimeResponse>(
        node,
        `/v1/vms/${encodeURIComponent(managerHandle)}`,
      );
      if (runtime.state !== 'running') return false;
      const response = await this.requestGuest(runtimeHandle, '/health');
      return response.ok;
    } catch {
      return false;
    }
  }

  async getPromptUrl(runtimeHandle: string): Promise<string> {
    return this.guestUrl(runtimeHandle, '/v1/prompt');
  }

  async getSessionUrl(runtimeHandle: string): Promise<string> {
    return this.guestUrl(runtimeHandle, '/v1/session');
  }

  async requestGuest(
    runtimeHandle: string,
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const { node, managerHandle } = await this.resolveTarget(runtimeHandle);
    return this.managerRequest(
      node,
      `/v1/vms/${encodeURIComponent(managerHandle)}/guest${path.startsWith('/') ? path : `/${path}`}`,
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

  /**
   * 调度候选排序。探针失败的节点直接剔除——宁可少一个候选，也不能把 VM 派给
   * 一台状态未知的机器（3s 超时误伤的节点下一次创建自动恢复）。
   */
  private async pickNodes(
    config: SandboxConfig,
  ): Promise<SandboxRuntimeNode[]> {
    const nodes = await this.registry.listSchedulable();
    if (nodes.length === 0) {
      throw new SandboxCreationException(
        'No active sandbox runtime nodes registered',
      );
    }
    const probes = await Promise.allSettled(
      nodes.map(async (node) => ({
        node,
        probe: await this.registry.probeNode(node),
      })),
    );
    const healthy: { node: SandboxRuntimeNode; capacity: CapacitySnapshot }[] =
      [];
    for (const result of probes) {
      if (result.status !== 'fulfilled') continue;
      const { node, probe } = result.value;
      if (!probe.healthy || !probe.capacity) continue;
      healthy.push({ node, capacity: probe.capacity });
    }
    if (healthy.length === 0) {
      throw new SandboxCreationException(
        `No healthy sandbox runtime nodes (probed: ${nodes
          .map((node) => node.id)
          .join(', ')})`,
      );
    }
    const fits = healthy.filter(
      ({ capacity }) =>
        capacity.vmsLimit - capacity.vmsUsed >= 1 &&
        capacity.vcpuLimit - capacity.vcpuUsed >= config.cpu &&
        capacity.memoryMiBLimit - capacity.memoryMiBUsed >= config.memory &&
        capacity.diskGiBLimit - capacity.diskGiBUsed >= config.disk,
    );
    // 全都放不下时不直接失败：容量快照可能已过时，把最终判定交给 manager 的 503。
    if (fits.length === 0) return healthy.map(({ node }) => node);
    return fits
      .sort(
        (left, right) =>
          freeMemoryRatio(right.capacity) - freeMemoryRatio(left.capacity),
      )
      .map(({ node }) => node);
  }

  private async resolveTarget(runtimeHandle: string): Promise<RuntimeTarget> {
    const { nodeId, managerHandle } = splitRuntimeHandle(runtimeHandle);
    return { node: await this.registry.getNodeOrThrow(nodeId), managerHandle };
  }

  private async managerJson<T>(
    node: SandboxRuntimeNode,
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    return this.readJson<T>(
      await this.managerRequest(node, path, init),
      `runtime manager ${init.method ?? 'GET'} ${path}`,
    );
  }

  private async managerRequest(
    node: SandboxRuntimeNode,
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const response = await undiciFetch(`${node.baseUrl}${path}`, {
      ...init,
      dispatcher: this.registry.getDispatcher(node),
      signal:
        init.signal ??
        AbortSignal.timeout(path.includes('/guest/') ? 15 * 60_000 : 60_000),
    });
    if (response.status === 404 && !path.includes('/guest/')) {
      throw new SandboxRuntimeNotFoundException();
    }
    if (!response.ok && !path.includes('/guest/')) {
      await response.body?.cancel();
      throw new ManagerRequestError(response.status);
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

  private async guestUrl(runtimeHandle: string, path: string): Promise<string> {
    const { node, managerHandle } = await this.resolveTarget(runtimeHandle);
    return `${node.baseUrl}/v1/vms/${encodeURIComponent(managerHandle)}/guest${path}`;
  }

  /**
   * exec handle 形如 `<nodeId>/<managerHandle>:<guestExecId>`，按第一个 `:` 切分
   * 即可拿回完整复合 runtimeHandle——节点前缀用的是 `/`，不会与此冲突。
   */
  private parseExecHandle(value: string): [string, string] {
    const separator = value.indexOf(':');
    if (separator <= 0 || separator === value.length - 1) {
      throw new Error('Invalid Firecracker exec handle');
    }
    return [value.slice(0, separator), value.slice(separator + 1)];
  }
}

/** 携带 HTTP 状态码的 manager 请求失败，供调度判断"该换节点还是直接失败"。 */
class ManagerRequestError extends Error {
  constructor(readonly status: number) {
    super(`Firecracker runtime request failed (${status})`);
    this.name = 'ManagerRequestError';
  }
}

/**
 * 只有"节点满"和"节点不可达"值得换机器重试；其余状态码（400 参数错、401 证书
 * 错、500 manager 内部错）在每个节点上都会以同样方式失败，重试纯属浪费。
 */
function isRetryableNodeFailure(error: unknown): boolean {
  if (error instanceof SandboxRuntimeNotFoundException) return false;
  if (error instanceof ManagerRequestError) return error.status === 503;
  return true;
}

/** 空闲内存比：以相对余量而非绝对值排序，避免大机器长期吃满而小机器空转。 */
function freeMemoryRatio(capacity: CapacitySnapshot): number {
  if (capacity.memoryMiBLimit <= 0) return 0;
  return (
    (capacity.memoryMiBLimit - capacity.memoryMiBUsed) / capacity.memoryMiBLimit
  );
}
