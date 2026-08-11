import { beforeEach, describe, expect, it, vi } from 'vitest'

import { registerPlugin } from '../pluginApi'

const { refreshSessionMock, signOutMock, setAuthTokenMock, accessToken } = vi.hoisted(() => ({
  refreshSessionMock: vi.fn(),
  signOutMock: vi.fn(),
  setAuthTokenMock: vi.fn(),
  accessToken: { current: 'token-current' as string | undefined },
}))

vi.mock('@/shared/api/client', () => ({
  apiClient: { get: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  toSnakeBody: (value: unknown) => value,
}))

vi.mock('@/shared/lib/supabase', () => ({
  supabase: { auth: { refreshSession: refreshSessionMock } },
}))

vi.mock('@/features/auth', () => ({
  setAuthToken: setAuthTokenMock,
}))

vi.mock('@/features/auth/stores/auth.store', () => ({
  useAuthStore: {
    getState: () => ({ accessToken: accessToken.current, signOut: signOutMock }),
  },
}))

interface QueuedResponse {
  status: number
  body: unknown
}

const responses: QueuedResponse[] = []
const sentRequests: {
  url: string
  headers: Record<string, string>
  entries: [string, FormDataEntryValue][]
}[] = []

let progressEmitter: ((loaded: number, total: number) => void) | null = null

class MockXhr {
  status = 0
  responseText = ''
  responseType = ''
  upload = {
    addEventListener: (_type: string, listener: (event: ProgressEvent) => void) => {
      progressEmitter = (loaded, total) => {
        listener({ lengthComputable: true, loaded, total } as ProgressEvent)
      }
    },
  }

  private url = ''
  private readonly headers: Record<string, string> = {}
  private readonly listeners: Record<string, (() => void) | undefined> = {}

  open(_method: string, url: string) {
    this.url = url
  }

  setRequestHeader(key: string, value: string) {
    this.headers[key] = value
  }

  addEventListener(type: string, listener: () => void) {
    this.listeners[type] = listener
  }

  send(body: FormData) {
    sentRequests.push({
      url: this.url,
      headers: this.headers,
      entries: [...body.entries()],
    })

    const next = responses.shift() ?? { status: 201, body: { data: {} } }
    this.status = next.status
    this.responseText = JSON.stringify(next.body)
    queueMicrotask(() => this.listeners.load?.())
  }
}

function makePayload(overrides: Partial<Parameters<typeof registerPlugin>[0]> = {}) {
  return {
    file: new File(['alp-bytes'], 'demo.alp'),
    ...overrides,
  }
}

describe('registerPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    responses.length = 0
    sentRequests.length = 0
    progressEmitter = null
    accessToken.current = 'token-current'
    vi.stubGlobal('XMLHttpRequest', MockXhr)
  })

  it('status 必须排在文件之前，否则服务端 parseRegisterOptions 读不到', async () => {
    responses.push({ status: 201, body: { data: { id: 'plugin-1' } } })

    await registerPlugin(makePayload({ status: 'active' }))

    expect(sentRequests[0]?.entries.map(([key]) => key)).toEqual(['status', 'file'])
    expect(sentRequests[0]?.headers).toEqual({ Authorization: 'Bearer token-current' })
    expect(sentRequests[0]?.headers['Content-Type']).toBeUndefined()
  })

  it('不带 status 时只发送文件字段', async () => {
    responses.push({ status: 201, body: { data: { id: 'plugin-1' } } })

    await registerPlugin(makePayload())

    expect(sentRequests[0]?.entries.map(([key]) => key)).toEqual(['file'])
  })

  it('回调上传字节进度并在成功时补到 100', async () => {
    responses.push({ status: 201, body: { data: { id: 'plugin-1' } } })
    const onProgress = vi.fn()

    const pending = registerPlugin(makePayload({ onProgress }))
    progressEmitter?.(25, 100)
    await pending

    expect(onProgress).toHaveBeenCalledWith(25)
    expect(onProgress).toHaveBeenLastCalledWith(100)
  })

  it('返回服务端 data 信封中的插件记录', async () => {
    responses.push({ status: 201, body: { data: { id: 'plugin-1', name: '翻译插件' } } })

    await expect(registerPlugin(makePayload())).resolves.toEqual({
      id: 'plugin-1',
      name: '翻译插件',
    })
  })

  it('签名校验失败虽然也是 401，但不刷新 token、不重传', async () => {
    responses.push({
      status: 401,
      body: {
        type: 'https://agentloom.dev/errors/plugin-signature-invalid',
        title: 'Plugin Signature Invalid',
        detail: '插件 "com.example.demo" 的签名验证失败。',
      },
    })

    await expect(registerPlugin(makePayload())).rejects.toThrow(
      '插件 "com.example.demo" 的签名验证失败。',
    )
    expect(refreshSessionMock).not.toHaveBeenCalled()
    expect(sentRequests).toHaveLength(1)
  })

  it('鉴权 401 时刷新 session 并用新 token 重传一次', async () => {
    responses.push({ status: 401, body: { title: 'Unauthorized' } })
    responses.push({ status: 201, body: { data: { id: 'plugin-1' } } })
    refreshSessionMock.mockResolvedValue({
      data: { session: { access_token: 'token-fresh' } },
      error: null,
    })

    await expect(registerPlugin(makePayload())).resolves.toEqual({ id: 'plugin-1' })

    expect(setAuthTokenMock).toHaveBeenCalledWith('token-fresh')
    expect(sentRequests).toHaveLength(2)
    expect(sentRequests[1]?.headers).toEqual({ Authorization: 'Bearer token-fresh' })
  })

  it('刷新失败时登出并给出明确的中文提示', async () => {
    responses.push({ status: 401, body: { title: 'Unauthorized' } })
    refreshSessionMock.mockResolvedValue({ data: { session: null }, error: new Error('expired') })

    await expect(registerPlugin(makePayload())).rejects.toThrow(
      '登录状态已过期，请重新登录后再上传插件包。',
    )
    expect(signOutMock).toHaveBeenCalled()
    expect(sentRequests).toHaveLength(1)
  })

  it('其他错误码展示服务端 detail', async () => {
    responses.push({
      status: 422,
      body: { title: 'Plugin Validation Failed', detail: '插件包缺少 manifest.json' },
    })

    await expect(registerPlugin(makePayload())).rejects.toThrow('插件包缺少 manifest.json')
  })
})
