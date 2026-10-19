/**
 * Sandbox 会话运行时边界：解析 sandbox 绑定、等待 guest 就绪并代理 prompt/abort，
 * 不管理 Agent 会话内存状态，也不负责模型配置与工具注册。
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SandboxSession } from '../../database/schema';
import { SandboxService } from '../sandbox/sandbox.service';
import {
  SANDBOX_RUNTIME_DRIVER,
  type SandboxRuntimeDriver,
} from '../sandbox/sandbox-runtime-driver.port';
import type { ContentBlock, ServerSandboxBinding } from './types';

export type SandboxBinding = ServerSandboxBinding;

const CONTAINER_WORKSPACE = '/workspace/';
const REQUEST_TIMEOUT_MS = 3_600_000;
/** abort / 审批回写这类 guest 控制请求的超时 */
const GUEST_CONTROL_REQUEST_TIMEOUT_MS = 5_000;
/** 会话丢失时读取 guest 诊断的超时：只用于补充错误原因，不能拖慢失败返回 */
const GUEST_DIAGNOSTICS_TIMEOUT_MS = 3_000;
/** 错误信息里列出的 OOM 记录条数上限 */
const MAX_REPORTED_OOM_KILLS = 3;
const SANDBOX_READY_TIMEOUT_MS = 30_000;
const SANDBOX_READY_POLL_INTERVAL_MS = 1_000;

/** guest 侧会话丢失的两种表现：prompt 流未收到终止帧就断开 / guest 报告会话不存在 */
export type GuestSessionLossKind = 'stream_interrupted' | 'session_missing';

/** guestd `GET /v1/runtime/diagnostics` 的响应（agentloom-firecracker-runtime/internal/guest/diagnostics.go） */
type GuestRuntimeDiagnostics = {
  uptimeSeconds?: number;
  runtimeRestarts?: number;
  lastRuntimeExit?: { at?: string; error?: string };
  oomKills?: Array<{
    pid?: number;
    command?: string;
    secondsSinceBoot?: number;
  }>;
};

@Injectable()
export class SandboxSessionRuntimeService {
  private readonly logger = new Logger(SandboxSessionRuntimeService.name);

  constructor(
    private readonly sandboxService: SandboxService,
    @Inject(SANDBOX_RUNTIME_DRIVER)
    private readonly runtimeDriver: SandboxRuntimeDriver,
  ) {}

  readSandboxBinding(workflowState: Record<string, unknown>): SandboxBinding {
    const executionId = readString(workflowState.executionId);
    const agentConversationId = readString(workflowState.agentConversationId);
    const serverSandbox = isRecord(workflowState.serverSandbox)
      ? workflowState.serverSandbox
      : undefined;
    const nestedExecutionId = readString(serverSandbox?.executionId);
    const nestedConversationId = readString(serverSandbox?.agentConversationId);
    const sandboxNodeId =
      readString(workflowState.sandboxNodeId) ??
      readString(serverSandbox?.sandboxNodeId);

    return {
      ...((executionId ?? nestedExecutionId)
        ? { executionId: executionId ?? nestedExecutionId }
        : {}),
      ...((agentConversationId ?? nestedConversationId)
        ? {
            agentConversationId: agentConversationId ?? nestedConversationId,
          }
        : {}),
      ...(sandboxNodeId ? { sandboxNodeId } : {}),
    };
  }

  hasSandboxBinding(binding: SandboxBinding): boolean {
    return Boolean(binding.executionId || binding.agentConversationId);
  }

  async waitForSandboxReady(
    binding: SandboxBinding,
    tenantId: string,
  ): Promise<SandboxSession & { runtimeHandle: string }> {
    const startedAt = Date.now();
    const bindingLabel = this.describeSandboxBinding(binding);

    while (Date.now() - startedAt < SANDBOX_READY_TIMEOUT_MS) {
      const session = await this.findBoundSandboxSession(binding, tenantId);

      if (!session) {
        const latest = binding.executionId
          ? await this.sandboxService.findLatestByExecutionId(
              binding.executionId,
              tenantId,
              binding.sandboxNodeId,
            )
          : binding.agentConversationId
            ? await this.sandboxService.findLatestByConversationId(
                binding.agentConversationId,
                tenantId,
              )
            : null;
        if (
          latest &&
          (latest.status === 'failed' || latest.status === 'stopped')
        ) {
          throw new Error(
            await this.describeUnavailableSandboxSession(latest, bindingLabel),
          );
        }
        throw new Error(`Sandbox session not found for ${bindingLabel}`);
      }

      if (session.status === 'failed' || session.status === 'stopped') {
        throw new Error(`Sandbox session ${session.id} is ${session.status}`);
      }

      if (
        session.status === 'ready' &&
        session.runtimeHandle &&
        (await this.runtimeDriver.healthCheck(session.runtimeHandle))
      ) {
        return { ...session, runtimeHandle: session.runtimeHandle };
      }

      await delay(SANDBOX_READY_POLL_INTERVAL_MS);
    }

    throw new Error(`Sandbox session is not ready for ${bindingLabel}`);
  }

  async requestPrompt(
    binding: SandboxBinding,
    tenantId: string,
    sessionId: string,
    content: ContentBlock[],
    abortSignal?: AbortSignal,
  ): Promise<Response> {
    const sandbox = await this.waitForSandboxReady(binding, tenantId);
    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = abortSignal
      ? AbortSignal.any([abortSignal, timeoutSignal])
      : timeoutSignal;
    return this.runtimeDriver.requestGuest(
      sandbox.runtimeHandle,
      '/v1/prompt',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, content, cwd: CONTAINER_WORKSPACE }),
        signal,
      },
    ) as Promise<Response>;
  }

  /**
   * guest 侧会话丢失时拼出用户可理解的原因：读取 guestd 运行时诊断，
   * 说明 VM 内存不足（内核 OOM 杀掉的进程）与 guest 运行时重启；诊断不可用时只给通用说明。
   */
  async describeGuestSessionLoss(
    binding: SandboxBinding,
    tenantId: string,
    kind: GuestSessionLossKind,
  ): Promise<string> {
    const parts = [
      kind === 'stream_interrupted'
        ? '沙箱 Agent 运行时在本轮回复完成前中断，本轮输出不完整，沙箱会话已丢失'
        : '沙箱 Agent 会话已丢失（guest 中已不存在该会话，通常是沙箱运行时重启所致）',
    ];

    let memoryMb: number | undefined;
    let diagnostics: GuestRuntimeDiagnostics | null = null;
    try {
      const sandbox = await this.findBoundSandboxSession(binding, tenantId);
      memoryMb = sandbox?.config?.memory;
      if (sandbox?.runtimeHandle) {
        const response = await this.runtimeDriver.requestGuest(
          sandbox.runtimeHandle,
          '/v1/runtime/diagnostics',
          {
            method: 'GET',
            signal: AbortSignal.timeout(GUEST_DIAGNOSTICS_TIMEOUT_MS),
          },
        );
        if (response.ok) {
          diagnostics = (await response.json()) as GuestRuntimeDiagnostics;
        }
      }
    } catch (error) {
      this.logger.warn(
        `读取沙箱运行时诊断失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const oomKills = (diagnostics?.oomKills ?? []).slice(
      -MAX_REPORTED_OOM_KILLS,
    );
    if (oomKills.length > 0) {
      const uptime = diagnostics?.uptimeSeconds;
      const victims = oomKills.map((kill) => {
        const ago =
          typeof uptime === 'number' &&
          uptime > 0 &&
          typeof kill.secondsSinceBoot === 'number'
            ? `，${Math.max(0, Math.round(uptime - kill.secondsSinceBoot))} 秒前`
            : '';
        return `${kill.command ?? '未知进程'}（pid ${kill.pid ?? '?'}${ago}）`;
      });
      parts.push(
        `沙箱 VM 内存不足，内核 OOM 终止了进程：${victims.join('、')}`,
      );
    }
    const restarts = diagnostics?.runtimeRestarts ?? 0;
    if (restarts > 0) {
      const lastExit = diagnostics?.lastRuntimeExit?.error;
      parts.push(
        `guest Agent 运行时已重启 ${restarts} 次${lastExit ? `（最近一次退出：${lastExit}）` : ''}`,
      );
    }
    if (oomKills.length > 0) {
      parts.push(
        `请在 Agent 画布的 Sandbox 节点调高内存${memoryMb ? `（当前 ${memoryMb} MB）` : ''}后重试`,
      );
    }
    parts.push('重试时会自动重建沙箱会话，工作区文件仍保留');
    return `${parts.join('；')}。`;
  }

  private async findBoundSandboxSession(
    binding: SandboxBinding,
    tenantId: string,
  ): Promise<SandboxSession | null> {
    if (binding.executionId) {
      return this.sandboxService.getSandboxSession(
        binding.executionId,
        tenantId,
        binding.sandboxNodeId,
      );
    }
    if (binding.agentConversationId) {
      return this.sandboxService.findByConversationId(
        binding.agentConversationId,
        tenantId,
      );
    }
    return null;
  }

  async abortContainerPrompt(
    sessionId: string,
    binding: SandboxBinding,
    tenantId: string,
  ): Promise<void> {
    try {
      const sandbox = await this.waitForSandboxReady(binding, tenantId);
      const response = await this.runtimeDriver.requestGuest(
        sandbox.runtimeHandle,
        '/v1/abort',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
          signal: AbortSignal.timeout(GUEST_CONTROL_REQUEST_TIMEOUT_MS),
        },
      );
      if (!response.ok) {
        this.logger.warn(
          `Sandbox abort 请求失败: session=${sessionId}, status=${response.status}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Sandbox abort 请求异常: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 把对话审批结果回写给 guest bridge（dsh 原生 / MCP / 插件工具的审批在 guest 内阻塞等待）。
   * guest 侧有独立超时兜底，回写失败只记录告警。
   */
  async resolveGuestToolPermission(
    sessionId: string,
    binding: SandboxBinding,
    tenantId: string,
    toolCallId: string,
    allowed: boolean,
  ): Promise<void> {
    try {
      const sandbox = await this.waitForSandboxReady(binding, tenantId);
      const response = await this.runtimeDriver.requestGuest(
        sandbox.runtimeHandle,
        '/v1/permission',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, toolCallId, allowed }),
          signal: AbortSignal.timeout(GUEST_CONTROL_REQUEST_TIMEOUT_MS),
        },
      );
      if (!response.ok) {
        this.logger.warn(
          `Sandbox 工具审批回写失败: session=${sessionId}, toolCallId=${toolCallId}, status=${response.status}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Sandbox 工具审批回写异常: session=${sessionId}, toolCallId=${toolCallId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async describeUnavailableSandboxSession(
    session: SandboxSession,
    bindingLabel: string,
  ): Promise<string> {
    if (session.status === 'failed') {
      try {
        const logs = await this.sandboxService.getSandboxLogs(session.id);
        const latest = [...logs]
          .reverse()
          .find(
            (log) =>
              log.level === 'system' &&
              log.message.startsWith('Sandbox creation failed:'),
          );
        if (latest) return latest.message;
      } catch (error) {
        this.logger.warn(
          `Failed to load sandbox logs for ${session.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return `Sandbox session ${session.id} is ${session.status} for ${bindingLabel}`;
  }

  private describeSandboxBinding(binding: SandboxBinding): string {
    if (binding.executionId && binding.agentConversationId) {
      return `execution ${binding.executionId}${binding.sandboxNodeId ? ` / sandbox ${binding.sandboxNodeId}` : ''} / conversation ${binding.agentConversationId}`;
    }
    if (binding.executionId) {
      return `execution ${binding.executionId}${binding.sandboxNodeId ? ` / sandbox ${binding.sandboxNodeId}` : ''}`;
    }
    if (binding.agentConversationId) {
      return `conversation ${binding.agentConversationId}`;
    }
    return 'sandbox binding';
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
