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
  | 'failed'

export interface ToolPermissionRequest {
  readonly description: string
  readonly resourcePaths?: readonly string[]
}

export interface ToolCallEvent {
  readonly id: string
  readonly tool: string
  readonly args: Record<string, unknown>
  readonly status: ToolCallStatus
  readonly result?: unknown
  readonly error?: string
  readonly permissionRequest?: ToolPermissionRequest
}
