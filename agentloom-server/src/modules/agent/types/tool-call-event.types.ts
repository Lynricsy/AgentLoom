// ─── 工具调用状态机 ─────────────────────────────────────────
//
//   pending ──→ awaiting_permission ──→ denied
//                      │
//                      ▼
//                 in_progress ──→ completed
//                      │
//                      ▼
//                   failed
//

/** 工具调用状态（有限状态机） */
export type ToolCallStatus =
  | 'pending'
  | 'awaiting_permission'
  | 'denied'
  | 'in_progress'
  | 'completed'
  | 'failed';

export type ToolCallTransitionSource = 'runtime' | 'worker' | 'user';

export interface ToolCallTransitionRecord {
  readonly from?: ToolCallStatus;
  readonly to: ToolCallStatus;
  readonly timestamp: string;
  readonly source: ToolCallTransitionSource;
}

export interface ToolPermissionRequest {
  readonly description: string;
  readonly resourcePaths?: readonly string[];
  readonly domain?: string;
  readonly category?: string;
  readonly riskLevel?: 'low' | 'medium' | 'high';
  readonly sourceLabel?: string;
  readonly targetType?: string;
  readonly targetLabel?: string;
  readonly approveEffect?: string;
  readonly denyEffect?: string;
  readonly diffPreview?: Record<string, unknown>;
  readonly rememberable?: boolean;
}

export interface ToolCallEvent {
  readonly id: string;
  readonly tool: string;
  readonly args: Record<string, unknown>;
  readonly status: ToolCallStatus;
  readonly transitions?: readonly ToolCallTransitionRecord[];
  readonly result?: unknown;
  readonly error?: string;
  readonly permissionRequest?: ToolPermissionRequest;
}
