import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { create } from 'zustand'
import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

import { supabase } from '@/shared/lib/supabase'

const AUTH_TOKEN_KEY = 'auth_token'

function syncTokenToStorage(token: string | null): void {
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

/**
 * 从 JWT access_token 中解码 tenant_id claim。
 * custom_access_token_hook (migration 0004) 将 tenant_id 注入到 JWT claims 顶层。
 * 新注册用户尚未创建组织时 tenant_id 为 null，此时 needsOnboarding 为 true。
 */
function decodeJwtTenantId(token: string): string | null {
  try {
    const segments = token.split('.')
    if (segments.length < 2 || !segments[1]) {
      return null
    }

    const segment = segments[1]
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const decoded = globalThis.atob(padded)
    const payload = JSON.parse(decoded) as Record<string, unknown>

    const tenantId = payload['tenant_id']
    if (typeof tenantId === 'string' && tenantId.trim().length > 0) {
      return tenantId.trim()
    }
    return null
  } catch {
    return null
  }
}

export interface AuthState {
  session: Session | null
  user: User | null
  accessToken: string | undefined
  isLoading: boolean
  isAuthenticated: boolean
  tenantId: string | null
  needsOnboarding: boolean
}

export interface AuthActions {
  initialize: () => Promise<void>
  signOut: () => Promise<void>
  _handleAuthChange: (event: AuthChangeEvent, session: Session | null) => void
  refreshAndCheckTenant: () => Promise<{ success: boolean; tenantId: string | null }>
}

function createInitialState(): AuthState {
  return {
    session: null,
    user: null,
    accessToken: undefined,
    isLoading: true,
    isAuthenticated: false,
    tenantId: null,
    needsOnboarding: false,
  }
}

export const useAuthStore = create<AuthState & AuthActions>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        ...createInitialState(),

        initialize: async () => {
          try {
            const {
              data: { session },
            } = await supabase.auth.getSession()

            const tenantId = session?.access_token
              ? decodeJwtTenantId(session.access_token)
              : null

            set((state) => {
              state.session = session as Session | null
              state.user = (session?.user as User) ?? null
              state.accessToken = session?.access_token ?? undefined
              state.isAuthenticated = !!session
              state.isLoading = false
              state.tenantId = tenantId
              state.needsOnboarding = !!session && tenantId === null
            })

            syncTokenToStorage(session?.access_token ?? null)

            const {
              data: { subscription },
            } = supabase.auth.onAuthStateChange((event, session) => {
              get()._handleAuthChange(event, session)
            })

            void subscription
          } catch {
            set((state) => {
              state.isLoading = false
            })
          }
        },

        signOut: async () => {
          await supabase.auth.signOut()
        },

        refreshAndCheckTenant: async () => {
          try {
            const { data, error } = await supabase.auth.refreshSession()
            if (error || !data.session) {
              return { success: false, tenantId: null }
            }

            const tenantId = decodeJwtTenantId(data.session.access_token)

            set((state) => {
              state.session = data.session as Session
              state.accessToken = data.session?.access_token ?? undefined
              state.tenantId = tenantId
              state.needsOnboarding = tenantId === null
            })

            syncTokenToStorage(data.session.access_token)

            return { success: true, tenantId }
          } catch {
            return { success: false, tenantId: null }
          }
        },

        _handleAuthChange: (event, session) => {
          switch (event) {
            case 'SIGNED_IN':
            case 'TOKEN_REFRESHED': {
              const tenantId = session?.access_token
                ? decodeJwtTenantId(session.access_token)
                : null

              set((state) => {
                state.session = session as Session | null
                state.user = (session?.user as User) ?? null
                state.accessToken = session?.access_token ?? undefined
                state.isAuthenticated = !!session
                state.isLoading = false
                state.tenantId = tenantId
                state.needsOnboarding = !!session && tenantId === null
              })
              syncTokenToStorage(session?.access_token ?? null)
              break
            }

            case 'SIGNED_OUT': {
              set((state) => {
                state.session = null
                state.user = null
                state.accessToken = undefined
                state.isAuthenticated = false
                state.isLoading = false
                state.tenantId = null
                state.needsOnboarding = false
              })
              syncTokenToStorage(null)
              break
            }

            default:
              break
          }
        },
      })),
    ),
    { name: 'AuthStore' },
  ),
)

export const useAccessToken = () =>
  useAuthStore((state) => state.accessToken)

export const useIsAuthenticated = () =>
  useAuthStore((state) => state.isAuthenticated)

export const useAuthLoading = () =>
  useAuthStore((state) => state.isLoading)
