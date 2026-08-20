/**
 * Memory 工具会话绑定边界：统一 provider 的注册、解绑守卫与非致命清理错误处理。
 */
import type { MemoryToolsService } from '../../agent-memory/memory-tools.service';
import type { IAgentRuntime } from '../ports/agent-runtime.port';

export type MemoryToolSessionBinding = {
  runtime: IAgentRuntime;
  memoryToolsService?: MemoryToolsService;
  sessionId: string | null | undefined;
  memorySessionIds: string[];
};

export function bindMemoryToolSession(
  binding: MemoryToolSessionBinding,
): boolean {
  if (
    !binding.sessionId ||
    binding.memorySessionIds.length === 0 ||
    !binding.memoryToolsService ||
    !binding.runtime.registerSessionToolProvider
  ) {
    return false;
  }

  binding.runtime.registerSessionToolProvider(
    binding.sessionId,
    binding.memoryToolsService.createSessionToolProvider(
      binding.memorySessionIds,
    ),
  );
  return true;
}

export function unbindMemoryToolSession(
  binding: MemoryToolSessionBinding,
  onError?: (error: unknown) => void,
): boolean {
  if (
    !binding.sessionId ||
    binding.memorySessionIds.length === 0 ||
    !binding.memoryToolsService ||
    !binding.runtime.unregisterSessionToolProvider
  ) {
    return false;
  }

  try {
    binding.runtime.unregisterSessionToolProvider(binding.sessionId);
  } catch (error) {
    onError?.(error);
  }
  return true;
}
