import type { ApiResponse } from '@/shared/types/api'
import { apiClient, toSnakeBody } from '@/shared/api/client'
import type {
  PtyBufferDumpResponse,
  PtySessionInfo,
  PtyWriteResponse,
} from '../types/pty'

export const ptyKeys = {
  all: ['pty'] as const,
  sessions: (executionId: string) =>
    [...ptyKeys.all, 'sessions', executionId] as const,
  bufferDumps: () => [...ptyKeys.all, 'buffer-dump'] as const,
  bufferDump: (executionId: string, sessionId: string) =>
    [...ptyKeys.bufferDumps(), executionId, sessionId] as const,
}

export async function fetchPtySessions(
  executionId: string,
): Promise<PtySessionInfo[]> {
  const res = await apiClient
    .get(`executions/${executionId}/pty/sessions`)
    .json<ApiResponse<PtySessionInfo[]>>()
  return res.data
}

export async function fetchPtyBufferDump(
  executionId: string,
  sessionId: string,
): Promise<PtyBufferDumpResponse> {
  const res = await apiClient
    .post(`executions/${executionId}/pty/buffer-dump`, {
      json: toSnakeBody({ sessionId }),
    })
    .json<ApiResponse<PtyBufferDumpResponse>>()
  return res.data
}

export async function sendPtyWrite(
  executionId: string,
  sessionId: string,
  data: string,
): Promise<PtyWriteResponse> {
  const res = await apiClient
    .post(`executions/${executionId}/pty/write`, {
      json: toSnakeBody({ sessionId, data }),
    })
    .json<ApiResponse<PtyWriteResponse>>()
  return res.data
}
