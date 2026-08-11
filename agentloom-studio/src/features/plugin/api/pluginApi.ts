import { apiClient } from '@/shared/api/client'
import { setAuthToken } from '@/features/auth'
import { useAuthStore } from '@/features/auth/stores/auth.store'
import { supabase } from '@/shared/lib/supabase'
import type { PaginatedResponse } from '@/shared/types/api'
import type { PluginRecord, PluginListItem, PluginStatus } from '../types'

/** 与 shared/api/client.ts 保持一致；XHR 上传走不了 ky 实例，只能自行拼前缀 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

export const PLUGIN_PACKAGE_EXTENSION = '.alp'

/** 服务端 ensureAlpFile 只校验文件名后缀，前端提前拦截给出友好提示 */
export function isPluginPackageFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(PLUGIN_PACKAGE_EXTENSION)
}

export async function fetchPlugins(params?: {
  page?: number
  pageSize?: number
  search?: string
  status?: PluginStatus
}): Promise<PaginatedResponse<PluginListItem>> {
  // QueryPluginsSchema 用的就是 camelCase 的 pageSize，勿改成 page_size
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set('page', String(params.page))
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize))
  if (params?.search) searchParams.set('search', params.search)
  if (params?.status) searchParams.set('status', params.status)

  return apiClient.get('plugins', { searchParams }).json<PaginatedResponse<PluginListItem>>()
}

export async function fetchPluginById(id: string): Promise<{ data: PluginRecord }> {
  return apiClient.get(`plugins/${id}`).json<{ data: PluginRecord }>()
}

export async function updatePluginStatus(
  id: string,
  payload: { status: PluginStatus; occVersion: number },
): Promise<{ data: PluginRecord }> {
  // UpdatePluginStatusSchema 是 .strict() 的 camelCase schema：
  // 套 toSnakeBody 发出 occ_version 会被直接判 422，务必原样发送。
  return apiClient
    .patch(`plugins/${id}/status`, { json: payload })
    .json<{ data: PluginRecord }>()
}

export async function deletePlugin(id: string): Promise<void> {
  await apiClient.delete(`plugins/${id}`)
}

export interface RegisterPluginPayload {
  file: File
  /** 注册后立刻切换到的状态，省略则服务端保持 registered */
  status?: PluginStatus
  /** 上传字节进度（0-100） */
  onProgress?: (percent: number) => void
}

interface RegisterAttempt {
  httpStatus: number
  body: unknown
}

/**
 * 上传 .alp 插件包并注册。
 *
 * 用 XMLHttpRequest 而不是 ky：ky 的 onUploadProgress 依赖 fetch 请求流式上传，
 * 浏览器只在 HTTP/2 以上才允许，普通 HTTP/1.1 部署会直接抛错，拿不到真实进度。
 * 代价是绕开了 ky 的 401 自动刷新重试，因此这里自行复刻同样的刷新语义。
 */
export async function registerPlugin(payload: RegisterPluginPayload): Promise<PluginRecord> {
  const attempt = await sendPluginArchive(payload, useAuthStore.getState().accessToken)

  if (attempt.httpStatus !== 401 || isSignatureRejection(attempt.body)) {
    return unwrapRegisteredPlugin(attempt, payload.onProgress)
  }

  // 与 client.ts 的 beforeRetry 同一条路径：401 先刷新 session，再重试一次上传。
  // 刷新失败就登出，由 __root 的路由守卫接管跳转。
  const { data, error } = await supabase.auth.refreshSession()
  const refreshedToken = data.session?.access_token

  if (error || !refreshedToken) {
    await useAuthStore.getState().signOut()
    throw new Error('登录状态已过期，请重新登录后再上传插件包。')
  }

  setAuthToken(refreshedToken)
  payload.onProgress?.(0)

  const retried = await sendPluginArchive(payload, refreshedToken)
  return unwrapRegisteredPlugin(retried, payload.onProgress)
}

/** 签名校验失败与鉴权失败都是 401，只有前者不该重试 */
function isSignatureRejection(body: unknown): boolean {
  const type = (body as { type?: unknown } | null)?.type
  return typeof type === 'string' && type.includes('plugin-signature-invalid')
}

function unwrapRegisteredPlugin(
  attempt: RegisterAttempt,
  onProgress: RegisterPluginPayload['onProgress'],
): PluginRecord {
  if (attempt.httpStatus >= 200 && attempt.httpStatus < 300) {
    const plugin = (attempt.body as { data?: PluginRecord } | null)?.data
    if (!plugin) {
      throw new Error('插件注册响应缺少数据')
    }
    onProgress?.(100)
    return plugin
  }

  // 服务端错误体为 RFC7807 风格 { type, title, status, detail }
  const { detail, title } = (attempt.body ?? {}) as Record<string, unknown>
  const message = [detail, title].find(
    (value): value is string => typeof value === 'string' && value.trim() !== '',
  )

  if (message) {
    throw new Error(message)
  }
  if (attempt.httpStatus === 401) {
    throw new Error('登录状态已过期，请重新登录后再上传插件包。')
  }
  throw new Error(`插件注册失败（HTTP ${attempt.httpStatus}）`)
}

/** 只有网络层失败才 reject；HTTP 错误码原样返回交给调用方判定 */
function sendPluginArchive(
  { file, status, onProgress }: RegisterPluginPayload,
  token: string | undefined,
): Promise<RegisterAttempt> {
  const formData = new FormData()
  // 字段顺序有意义：服务端 parseRegisterOptions 在读取文件缓冲之前就取 fields，
  // 排在文件之后的字段那时还没被解析，status 必须先 append。
  if (status) {
    formData.append('status', status)
  }
  formData.append('file', file)

  // 项目 lib target 尚无 Promise.withResolvers，只能用 executor 形式捕获 resolve/reject
  let resolve!: (value: RegisterAttempt) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<RegisterAttempt>((res, rej) => {
    resolve = res
    reject = rej
  })

  const request = new XMLHttpRequest()
  request.open('POST', `${API_BASE_URL}/plugins`)
  request.responseType = 'text'
  // ky 的 beforeRequest 只加 Authorization 这一个头；Content-Type 必须留空，
  // 让浏览器补 multipart boundary。
  if (token) {
    request.setRequestHeader('Authorization', `Bearer ${token}`)
  }

  if (onProgress) {
    request.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable || event.total === 0) return
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
    })
  }

  request.addEventListener('load', () => {
    let body: unknown = null
    try {
      body = JSON.parse(request.responseText) as unknown
    } catch {
      body = null
    }
    resolve({ httpStatus: request.status, body })
  })

  request.addEventListener('error', () => {
    reject(new Error('网络异常，插件上传失败'))
  })
  request.addEventListener('abort', () => {
    reject(new Error('插件上传已取消'))
  })

  request.send(formData)

  return promise
}
