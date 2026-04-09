import type { SandboxConfig } from '../../database/schema';
import { resolveSandboxConversationIdleAutoEndMinutes } from './sandbox-conversation-idle.utils';

const DEFAULT_AGENT_RUNTIME_SANDBOX_CONFIG = {
  cpu: 1,
  memory: 512,
  disk: 2,
  timeout: 0,
} satisfies Pick<SandboxConfig, 'cpu' | 'memory' | 'disk' | 'timeout'>;

export function resolveAgentRuntimeSandboxConfig(
  config?: SandboxConfig | null,
): SandboxConfig {
  return {
    cpu:
      typeof config?.cpu === 'number'
        ? config.cpu
        : DEFAULT_AGENT_RUNTIME_SANDBOX_CONFIG.cpu,
    memory:
      typeof config?.memory === 'number'
        ? config.memory
        : DEFAULT_AGENT_RUNTIME_SANDBOX_CONFIG.memory,
    disk:
      typeof config?.disk === 'number'
        ? config.disk
        : DEFAULT_AGENT_RUNTIME_SANDBOX_CONFIG.disk,
    timeout:
      typeof config?.timeout === 'number'
        ? config.timeout
        : DEFAULT_AGENT_RUNTIME_SANDBOX_CONFIG.timeout,
    ...(typeof config?.timeoutSeconds === 'number'
      ? { timeoutSeconds: config.timeoutSeconds }
      : {}),
    conversationIdleAutoEndMinutes:
      resolveSandboxConversationIdleAutoEndMinutes(config ?? {}),
    ...(typeof config?.persistencePath === 'string'
      ? { persistencePath: config.persistencePath }
      : {}),
    ...(typeof config?.restoreWorkspaceId === 'string'
      ? { restoreWorkspaceId: config.restoreWorkspaceId }
      : {}),
    ...(config?.lifecycleMode ? { lifecycleMode: config.lifecycleMode } : {}),
    ...(typeof config?.persistenceExpiryHours === 'number'
      ? { persistenceExpiryHours: config.persistenceExpiryHours }
      : {}),
    ...(typeof config?.name === 'string' ? { name: config.name } : {}),
    ...(typeof config?.persistentSandboxId === 'string'
      ? { persistentSandboxId: config.persistentSandboxId }
      : {}),
  };
}
