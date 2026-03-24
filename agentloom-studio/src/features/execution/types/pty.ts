// 客户端 PTY 终端事件类型 — 与服务端 pty-agent-event.types.ts 保持对齐

// ─── PTY Session ───

export type PtySessionStatus = 'running' | 'exited' | 'killing' | 'killed'

export interface PtySessionInfo {
  sessionId: string
  title: string
  command: string
  args: string[]
  workdir: string
  status: PtySessionStatus
  exitCode?: number
  exitSignal?: number | string
  pid: number
  createdAt: string
  lineCount: number
}

// ─── PTY Events (discriminated union) ───

export interface PtySpawnedEvent {
  type: 'pty.spawned'
  sessionId: string
  info: PtySessionInfo
}

export interface PtyOutputEvent {
  type: 'pty.output'
  sessionId: string
  data: string
}

export interface PtyExitEvent {
  type: 'pty.exit'
  sessionId: string
  exitCode?: number
  exitSignal?: number | string
}

export interface PtyKilledEvent {
  type: 'pty.killed'
  sessionId: string
}

export type PtyEvent =
  | PtySpawnedEvent
  | PtyOutputEvent
  | PtyExitEvent
  | PtyKilledEvent

// ─── PTY Hook State ───

export interface PtySessionState {
  info: PtySessionInfo
  outputBuffer: string[]
}

// ─── PTY API Responses ───

export interface PtyBufferDumpResponse {
  lines: string[]
  totalLines: number
}

export interface PtyWriteResponse {
  success: boolean
}
