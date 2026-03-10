import { Injectable, Logger } from '@nestjs/common';
import type { ToolCallStatus } from '../../agent/types/tool-call-event.types';
import { InvalidToolCallTransitionException } from '../execution.exceptions';

// ─── 工具调用状态转换规则 ────────────────────────────────────────
//
//   pending ──→ awaiting_permission ──→ denied
//     │                 │
//     │                 ▼
//     ├──────→ in_progress ──→ completed
//     │                │
//     ▼                ▼
//   failed           failed
//

const TOOL_CALL_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  pending: new Set<ToolCallStatus>([
    'in_progress',
    'awaiting_permission',
    'failed',
  ]),
  awaiting_permission: new Set<ToolCallStatus>(['in_progress', 'denied']),
  in_progress: new Set<ToolCallStatus>(['completed', 'failed']),
  denied: new Set(),
  completed: new Set(),
  failed: new Set(),
} as const;

@Injectable()
export class ToolCallStateMachineService {
  private readonly logger = new Logger(ToolCallStateMachineService.name);

  /** @throws InvalidToolCallTransitionException 当转换不合法时 */
  transition(
    currentStatus: ToolCallStatus,
    targetStatus: ToolCallStatus,
  ): ToolCallStatus {
    const allowed = TOOL_CALL_TRANSITIONS[currentStatus];

    if (!allowed || !allowed.has(targetStatus)) {
      this.logger.warn(
        `非法工具调用状态转换: ${currentStatus} → ${targetStatus}`,
      );
      throw new InvalidToolCallTransitionException(currentStatus, targetStatus);
    }

    this.logger.debug(`工具调用状态转换: ${currentStatus} → ${targetStatus}`);
    return targetStatus;
  }

  isTerminal(status: ToolCallStatus): boolean {
    const allowed = TOOL_CALL_TRANSITIONS[status];
    return !allowed || allowed.size === 0;
  }

  getAllowedTransitions(status: ToolCallStatus): readonly ToolCallStatus[] {
    const allowed = TOOL_CALL_TRANSITIONS[status];
    return allowed ? ([...allowed] as ToolCallStatus[]) : [];
  }
}
