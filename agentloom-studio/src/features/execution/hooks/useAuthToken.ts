// TODO(auth): 当认证系统实现后，替换为真正的 JWT 获取逻辑
// 当前: localStorage('auth_token')，开发时手动设置

import { useSyncExternalStore } from 'react'

const AUTH_TOKEN_KEY = 'auth_token'

function subscribeToStorage(callback: () => void) {
  const handler = (e: StorageEvent) => {
    if (e.key === AUTH_TOKEN_KEY || e.key === null) {
      callback()
    }
  }
  globalThis.addEventListener('storage', handler)
  return () => globalThis.removeEventListener('storage', handler)
}

function getSnapshot(): string | undefined {
  try {
    return globalThis.localStorage?.getItem(AUTH_TOKEN_KEY) ?? undefined
  } catch {
    return undefined
  }
}

function getServerSnapshot(): string | undefined {
  return undefined
}

/** 返回 `undefined` 时 socket 连接将被服务端以 4001 拒绝 */
export function useAuthToken(): string | undefined {
  return useSyncExternalStore(subscribeToStorage, getSnapshot, getServerSnapshot)
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) {
      globalThis.localStorage?.setItem(AUTH_TOKEN_KEY, token)
    } else {
      globalThis.localStorage?.removeItem(AUTH_TOKEN_KEY)
    }
  } catch {
    // SSR / localStorage 不可用时静默失败
  }
}
