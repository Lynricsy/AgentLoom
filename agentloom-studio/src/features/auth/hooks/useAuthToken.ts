import { useAuthStore } from '../stores/auth.store'

export function useAuthToken(): string | undefined {
  return useAuthStore((state) => state.accessToken)
}

export function setAuthToken(token: string | null): void {
  const AUTH_TOKEN_KEY = 'auth_token'
  try {
    if (token) {
      globalThis.localStorage?.setItem(AUTH_TOKEN_KEY, token)
    } else {
      globalThis.localStorage?.removeItem(AUTH_TOKEN_KEY)
    }
  } catch {
    /* noop */
  }
}
