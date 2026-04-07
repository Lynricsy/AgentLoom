import { ModuleRef } from '@nestjs/core';

import {
  AGENT_RUNTIME,
  type IAgentRuntime,
} from '../agent/ports/agent-runtime.port';
import { ACP_AGENT_RUNTIME_OVERRIDE } from './acp-runtime.tokens';

function safeGetRuntime<T>(
  moduleRef: ModuleRef,
  token: string | symbol,
): T | undefined {
  try {
    return moduleRef.get<T>(token, {
      strict: false,
    });
  } catch {
    return undefined;
  }
}

export function resolveAcpAgentRuntime(moduleRef: ModuleRef): IAgentRuntime {
  const overrideRuntime =
    process.env.ACP_TEST_FAKE_RUNTIME === '1'
      ? safeGetRuntime<IAgentRuntime>(moduleRef, ACP_AGENT_RUNTIME_OVERRIDE)
      : undefined;
  const runtime =
    overrideRuntime ?? safeGetRuntime<IAgentRuntime>(moduleRef, AGENT_RUNTIME);

  if (!runtime) {
    throw new Error('ACP agent runtime is not available');
  }

  return runtime;
}
