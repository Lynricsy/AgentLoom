import { HTTPError } from 'ky'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchPtySessions } from './pty'

const mocks = vi.hoisted(() => {
  const jsonMock = vi.fn()
  const getMock = vi.fn(() => ({ json: jsonMock }))

  return {
    getMock,
    jsonMock,
  }
})

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: mocks.getMock,
  },
  toSnakeBody: vi.fn((value: unknown) => value),
}))

function makeHttpError(status: number, statusText = 'Not Found') {
  const response = new Response(null, { status, statusText })
  const request = new Request('http://localhost/api/v1/executions/exec-001/pty/sessions', {
    method: 'GET',
  })

  return new HTTPError(response, request, {} as never)
}

describe('fetchPtySessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('正常返回 PTY 会话列表', async () => {
    mocks.jsonMock.mockResolvedValue({
      data: [{ sessionId: 'pty-001', title: 'bash', status: 'running' }],
    })

    await expect(fetchPtySessions('exec-001')).resolves.toEqual([
      { sessionId: 'pty-001', title: 'bash', status: 'running' },
    ])

    expect(mocks.getMock).toHaveBeenCalledWith('executions/exec-001/pty/sessions')
  })

  it('404 时应回退为空列表，避免调试视图崩溃', async () => {
    mocks.jsonMock.mockRejectedValue(makeHttpError(404))

    await expect(fetchPtySessions('exec-001')).resolves.toEqual([])
  })

  it('非 404 错误应继续抛出', async () => {
    mocks.jsonMock.mockRejectedValue(makeHttpError(503, 'Service Unavailable'))

    await expect(fetchPtySessions('exec-001')).rejects.toBeInstanceOf(HTTPError)
  })
})
